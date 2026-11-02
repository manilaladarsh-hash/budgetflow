import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadState, saveState, snapshotLegacyData, normalizeCategories, normalizeTransactions, normalizeState,
  clearAllData, sortCategories
} from '../lib/storage.js';
import { renewCycles } from '../lib/cycle.js';
import {
  addTransactions, removeTransaction, replaceTransaction, restoreTransaction, newId, buildTransaction
} from '../lib/transactions.js';
import { dailyBudget, spentOnDay, updateStreak, advanceDue } from '../lib/analytics.js';
import { localDayKey } from '../lib/dates.js';
import { periodStartFor } from '../lib/cycle.js';
import { merchantKey, learnRule } from '../lib/merchants.js';
import { roundMoney } from '../lib/money.js';

const StoreContext = createContext(null);

export const useStore = () => {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
};

const useNow = (intervalMs = 30000) => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [intervalMs]);
  return now;
};

const listOps = (update, key) => ({
  add: (item) => {
    const full = { id: newId(), createdAt: new Date().toISOString(), ...item };
    update((s) => ({ ...s, [key]: [...s[key], full] }));
    return full;
  },
  update: (id, patch) => update((s) => ({ ...s, [key]: s[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
  remove: (id) => update((s) => ({ ...s, [key]: s[key].filter((x) => x.id !== id) }))
});

export function StoreProvider({ children, onEvent }) {
  const [state, setState] = useState(() => {
    snapshotLegacyData();
    return loadState();
  });
  const [syncStatus, setSyncStatus] = useState('off');
  const [ready, setReady] = useState(false);
  const [writeTick, setWriteTick] = useState(0);
  const now = useNow();
  const savedRef = useRef(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sync = useRef({ phase: 'off', pending: [], base: null, lastRemote: null, handle: null });
  const eventRef = useRef(onEvent);
  eventRef.current = onEvent;
  const emit = (type, payload) => eventRef.current?.(type, payload);

  // Persist every change to the legacy localStorage keys.
  useEffect(() => {
    saveState(state, savedRef.current);
    savedRef.current = state;
  }, [state]);

  const update = useCallback((fn) => {
    setState((s) => fn(s));
    if (sync.current.phase === 'pending') sync.current.pending.push(fn);
  }, []);

  // ---- Cloud sync lifecycle ----
  const cloudSync = state.prefs.cloudSync;
  useEffect(() => {
    const s = sync.current;
    if (!cloudSync) {
      s.phase = 'off';
      setSyncStatus('off');
      setReady(true);
      return undefined;
    }
    let cancelled = false;
    s.phase = 'pending';
    s.pending = [];
    s.base = stateRef.current;
    s.lastRemote = null;
    s.handle = null;
    const fallback = setTimeout(() => {
      if (!cancelled && s.phase === 'pending') { setReady(true); setSyncStatus((st) => (st === 'connecting' ? 'offline' : st)); }
    }, 6000);

    const onRemote = (remote) => {
      if (cancelled) return;
      const slice = {
        categories: normalizeCategories(remote.categories) || [],
        transactions: normalizeTransactions(remote.transactions)
      };
      if (s.phase === 'pending') {
        if (slice.categories.length === 0) {
          // Nothing in the cloud yet: upload what this device has.
          s.lastRemote = { categories: [], transactions: [], weeksTracked: null };
          s.phase = 'live';
          s.pending = [];
          setWriteTick((n) => n + 1);
        } else {
          const base = { ...s.base, ...slice, weeksTracked: remote.weeksTracked || s.base.weeksTracked };
          const replayed = s.pending.reduce((acc, fn) => fn(acc), base);
          s.lastRemote = { ...slice, weeksTracked: remote.weeksTracked };
          s.phase = 'live';
          s.pending = [];
          setState(replayed);
        }
        setReady(true);
        setSyncStatus('synced');
        return;
      }
      const next = { ...slice, weeksTracked: remote.weeksTracked || stateRef.current.weeksTracked };
      s.lastRemote = next;
      setState((cur) => ({ ...cur, ...next }));
    };

    startCloud({ onRemote, onStatus: (st) => !cancelled && setSyncStatus(st) })
      .then((handle) => {
        if (cancelled) { handle.stop(); return; }
        s.handle = handle;
        setWriteTick((n) => n + 1);
      })
      .catch(() => {
        if (cancelled) return;
        setSyncStatus('offline');
        setReady(true);
      });

    return () => {
      cancelled = true;
      clearTimeout(fallback);
      s.handle?.stop();
      s.handle = null;
      s.phase = 'off';
    };
  }, [cloudSync]);

  // Mirror budget data to the cloud when it changes.
  useEffect(() => {
    const s = sync.current;
    if (s.phase !== 'live' || !s.handle) return;
    const next = { categories: state.categories, transactions: state.transactions, weeksTracked: state.weeksTracked };
    const prev = s.lastRemote;
    if (prev && prev.categories === next.categories && prev.transactions === next.transactions && prev.weeksTracked === next.weeksTracked) return;
    s.lastRemote = next;
    s.handle.write(prev, next)
      .then(() => setSyncStatus('synced'))
      .catch(() => setSyncStatus('error'));
  }, [state.categories, state.transactions, state.weeksTracked, writeTick]);

  // ---- Automatic cycle renewal ----
  useEffect(() => {
    if (!ready) return;
    const result = renewCycles(stateRef.current, now);
    if (!result.renewed) return;
    update((s) => {
      const r = renewCycles(s, now);
      if (!r.renewed) return s;
      const achievements = r.noOverdraft && !s.achievements.includes('no_overdraft') ? [...s.achievements, 'no_overdraft'] : s.achievements;
      return { ...r.state, achievements };
    });
    emit('cycle', { weeks: result.state.weeksTracked, renewed: result.renewed });
  }, [ready, now, update]);

  // ---- Under-budget streak ----
  useEffect(() => {
    if (!ready) return;
    const s = stateRef.current;
    const next = updateStreak({
      streak: s.streak.count,
      lastDate: s.streak.lastDate,
      todaySpent: spentOnDay(s.transactions, now),
      dailyLimit: dailyBudget(s.categories),
      now
    });
    if (!next) return;
    const unlocked = [];
    if (next.streak >= 7 && !s.achievements.includes('7day')) unlocked.push('7day');
    if (next.streak >= 30 && !s.achievements.includes('30day')) unlocked.push('30day');
    update((cur) => ({
      ...cur,
      streak: { count: next.streak, lastDate: next.lastDate },
      achievements: unlocked.length ? [...cur.achievements, ...unlocked] : cur.achievements
    }));
    unlocked.forEach((a) => emit('achievement', a));
  }, [ready, now, state.transactions, update]);

  // ---- Actions ----
  const actions = useMemo(() => {
    const goals = listOps(update, 'goals');
    const subscriptions = listOps(update, 'subscriptions');
    const bills = listOps(update, 'bills');
    const netWorth = listOps(update, 'netWorth');
    const wishlist = listOps(update, 'wishlist');

    const logExpense = (s, { amount, description, categoryId, tags = [] }) => {
      const category = s.categories.find((c) => c.id === categoryId);
      if (!category || !(amount > 0)) return s;
      return addTransactions(s, [buildTransaction({ type: 'expense', amount, description, category, tags })]);
    };

    return {
      addTransactions: (txs) => update((s) => addTransactions(s, txs)),
      deleteTransaction: (id) => {
        const tx = stateRef.current.transactions.find((t) => t.id === id);
        update((s) => removeTransaction(s, id));
        return tx;
      },
      restoreTransaction: (tx) => update((s) => restoreTransaction(s, tx)),
      editTransaction: (tx) => update((s) => {
        const prev = s.transactions.find((t) => t.id === tx.id);
        let next = { ...tx, updatedAt: new Date().toISOString() };
        // Imported entries count toward balances only inside the current period.
        if (next.source === 'import') {
          const cat = s.categories.find((c) => c.id === next.categoryId);
          const inPeriod = cat && new Date(next.date) >= periodStartFor(cat, s.cycleStartDate);
          if (inPeriod) delete next.affectsBalance; else next = { ...next, affectsBalance: false };
        }
        let state = replaceTransaction(s, next);
        // Re-categorising an imported / Apple Pay entry teaches the auto-sort.
        if (prev && (next.source === 'import' || next.source === 'applepay') && prev.categoryId !== next.categoryId && (next.type || 'expense') === 'expense') {
          const key = merchantKey(next.originalDescription || next.description);
          if (key) state = { ...state, importRules: learnRule(state.importRules, { key, categoryId: next.categoryId }) };
        }
        return state;
      }),
      removeTransactions: (ids) => {
        const set = new Set(ids);
        const removed = stateRef.current.transactions.filter((t) => set.has(t.id));
        update((s) => removed.reduce((acc, t) => removeTransaction(acc, t.id), s));
        return removed;
      },
      importBatch: ({ transactions, rules, profiles }) => update((s) => {
        const state = addTransactions(s, transactions);
        return { ...state, importRules: rules ?? s.importRules, importProfiles: profiles ? { ...s.importProfiles, ...profiles } : s.importProfiles };
      }),
      undoImport: (batchId) => update((s) => s.transactions
        .filter((t) => t.importBatch === batchId)
        .reduce((acc, t) => removeTransaction(acc, t.id), s)),
      setRules: (rules) => update((s) => ({ ...s, importRules: rules })),

      addCategory: (cat) => {
        const id = newId();
        update((s) => ({
          ...s,
          categories: [...s.categories, {
            id, pinned: false, frequency: 'weekly', icon: 'circle', ...cat,
            limit: roundMoney(cat.limit), balance: roundMoney(cat.balance ?? cat.limit),
            order: Math.max(-1, ...s.categories.map((c) => c.order ?? 0)) + 1
          }]
        }));
        return id;
      },
      updateCategory: (id, patch) => update((s) => ({
        ...s,
        categories: s.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        transactions: patch.name
          ? s.transactions.map((t) => (t.categoryId === id ? { ...t, categoryName: patch.name } : t))
          : s.transactions
      })),
      deleteCategory: (id) => update((s) => ({ ...s, categories: s.categories.filter((c) => c.id !== id) })),
      togglePin: (id) => update((s) => ({ ...s, categories: s.categories.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)) })),
      moveCategory: (id, dir) => update((s) => {
        const ordered = sortCategories(s.categories.map((c) => ({ ...c, pinned: false }))).map((c) => c.id);
        const i = ordered.indexOf(id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= ordered.length) return s;
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
        return { ...s, categories: s.categories.map((c) => ({ ...c, order: ordered.indexOf(c.id) })) };
      }),
      applyTuneUp: (proposals) => update((s) => ({
        ...s,
        categories: s.categories.map((c) => {
          const p = proposals.find((x) => String(x.id) === c.id);
          const limit = Number(p?.newLimit);
          return p && Number.isFinite(limit) && limit >= 0 ? { ...c, limit: roundMoney(limit) } : c;
        })
      })),

      setPrefs: (patch) => update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } })),
      setTags: (tags) => update((s) => ({ ...s, tags })),

      goals: {
        ...goals,
        deposit: (id, amount) => {
          const goal = stateRef.current.goals.find((g) => g.id === id);
          const reached = goal && goal.saved < goal.target && goal.saved + amount >= goal.target;
          update((s) => ({
            ...s,
            goals: s.goals.map((g) => (g.id === id
              ? { ...g, saved: roundMoney(g.saved + amount), deposits: [...(g.deposits || []), { amount, date: new Date().toISOString() }] }
              : g))
          }));
          return reached;
        },
        withdraw: (id, amount) => update((s) => ({
          ...s,
          goals: s.goals.map((g) => (g.id === id
            ? { ...g, saved: roundMoney(Math.max(0, g.saved - amount)), deposits: [...(g.deposits || []), { amount: -amount, date: new Date().toISOString() }] }
            : g))
        }))
      },
      subscriptions: {
        ...subscriptions,
        toggle: (id) => update((s) => ({ ...s, subscriptions: s.subscriptions.map((x) => (x.id === id ? { ...x, active: !x.active } : x)) })),
        markPaid: (id, { log } = {}) => update((s) => {
          const sub = s.subscriptions.find((x) => x.id === id);
          if (!sub) return s;
          const next = {
            ...s,
            subscriptions: s.subscriptions.map((x) => (x.id === id
              ? { ...x, nextDue: advanceDue(x.nextDue || localDayKey(), x.frequency), lastPaid: localDayKey() }
              : x))
          };
          return log ? logExpense(next, { amount: sub.amount, description: sub.name, categoryId: sub.categoryId, tags: ['bills'] }) : next;
        })
      },
      bills: {
        ...bills,
        markPaid: (id, { log } = {}) => update((s) => {
          const d = new Date();
          const bill = s.bills.find((b) => b.id === id);
          if (!bill) return s;
          const next = { ...s, bills: s.bills.map((b) => (b.id === id ? { ...b, lastPaidMonth: `${d.getFullYear()}-${d.getMonth()}` } : b)) };
          return log ? logExpense(next, { amount: bill.amount, description: bill.name, categoryId: bill.categoryId, tags: ['bills'] }) : next;
        }),
        markUnpaid: (id) => update((s) => ({ ...s, bills: s.bills.map((b) => (b.id === id ? { ...b, lastPaidMonth: null } : b)) }))
      },
      netWorth,
      wishlist: {
        ...wishlist,
        togglePurchased: (id) => update((s) => ({ ...s, wishlist: s.wishlist.map((w) => (w.id === id ? { ...w, purchased: !w.purchased } : w)) }))
      },

      restoreBackup: (restored) => update(() => restored),
      resetAll: () => {
        clearAllData();
        update((s) => {
          const fresh = normalizeState({ prefs: { theme: s.prefs.theme, cloudSync: s.prefs.cloudSync } });
          fresh.cycleStartDate = new Date().toISOString();
          return fresh;
        });
      }
    };
  }, [update]);

  const value = useMemo(() => ({ state, actions, now, syncStatus, ready }), [state, actions, now, syncStatus, ready]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

// Indirection so tests / offline builds can stub the cloud module.
const startCloud = async (opts) => {
  const mod = await import('../lib/sync.js');
  return mod.startSync(opts);
};
