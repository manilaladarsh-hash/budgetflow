import { describe, it, expect, beforeEach } from 'vitest';
import { localDayKey, getNextSunday, formatCountdown, isoForDay, startOfWeekSunday } from '../../app/src/lib/dates.js';
import { formatMoney, parseAmount, formatMoneyCompact } from '../../app/src/lib/money.js';
import {
  applyTransactionImpact, addTransactions, removeTransaction, replaceTransaction, restoreTransaction,
  buildTransaction, buildTransfer
} from '../../app/src/lib/transactions.js';
import { renewCycles, rolloverPreview } from '../../app/src/lib/cycle.js';
import { normalizeState, loadState, saveState, KEYS, snapshotLegacyData, sortCategories } from '../../app/src/lib/storage.js';
import { createBackup, parseBackup, transactionsToCsv } from '../../app/src/lib/backup.js';
import {
  overview, cyclePace, billsWithStatus, advanceDue, dailySeries, heatmap, categorySpending,
  monthComparison, updateStreak, spentOnDay, upcomingSubscriptions
} from '../../app/src/lib/analytics.js';
import { extractJson } from '../../app/src/lib/gemini.js';

// Minimal localStorage for node.
class MemoryStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key(i) { return [...this.m.keys()][i] ?? null; }
  get length() { return this.m.size; }
}
beforeEach(() => { globalThis.localStorage = new MemoryStorage(); });

const cats = () => [
  { id: '1', name: 'Grocery', limit: 70, balance: 70, icon: 'apple', frequency: 'weekly', order: 0 },
  { id: '3', name: 'Rent', limit: 700, balance: 700, icon: 'home', frequency: 'monthly', order: 1 }
];
const baseState = (over = {}) => normalizeState({ categories: cats(), transactions: [], cycleStartDate: '2026-10-25T04:00:00.000Z', weeksTracked: 1, ...over });

describe('dates', () => {
  it('uses local days, not UTC', () => {
    // 9:30pm in Toronto on Oct 31 is Nov 1 in UTC.
    const d = new Date('2026-11-01T01:30:00.000Z');
    expect(d.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(localDayKey(d)).toBe('2026-10-31');
  });
  it('finds the next Sunday', () => {
    expect(localDayKey(getNextSunday(new Date(2026, 9, 28, 15)))).toBe('2026-11-01'); // Wed -> Sun
    expect(localDayKey(getNextSunday(new Date(2026, 10, 1, 9)))).toBe('2026-11-08'); // Sun -> next Sun
    expect(localDayKey(startOfWeekSunday(new Date(2026, 10, 4)))).toBe('2026-11-01');
  });
  it('formats countdowns', () => {
    expect(formatCountdown(2 * 86400000 + 3 * 3600000)).toBe('2d 3h');
    expect(formatCountdown(5 * 60000)).toBe('5m');
  });
  it('backdates to the chosen local day', () => {
    const now = new Date(2026, 10, 3, 20, 15);
    expect(localDayKey(isoForDay('2026-11-01', now))).toBe('2026-11-01');
    expect(isoForDay(localDayKey(now), now)).toBe(now.toISOString());
  });
});

describe('money', () => {
  it('formats with the chosen symbol', () => {
    expect(formatMoney(12.5, '€')).toBe('€12.50');
    expect(formatMoney(-1200, '$')).toBe('−$1,200');
    expect(formatMoney(5, '₹', { signed: true })).toBe('+₹5');
    expect(formatMoney(9.999, 'CHF')).toBe('CHF 10');
    expect(formatMoneyCompact(25400, '$')).toBe('$25.4k');
  });
  it('parses user input', () => {
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('1,234.5')).toBe(1234.5);
    expect(parseAmount(' $40 ')).toBe(40);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
  });
});

describe('transactions', () => {
  it('adds, edits, deletes and restores with balance changes', () => {
    let s = baseState();
    const tx = buildTransaction({ type: 'expense', amount: 20, category: s.categories[0] });
    s = addTransactions(s, [tx]);
    expect(s.categories[0].balance).toBe(50);
    s = replaceTransaction(s, { ...tx, amount: 30 });
    expect(s.categories[0].balance).toBe(40);
    s = replaceTransaction(s, { ...tx, amount: 30, type: 'income' });
    expect(s.categories[0].balance).toBe(100);
    const removed = s.transactions[0];
    s = removeTransaction(s, tx.id);
    expect(s.categories[0].balance).toBe(70);
    expect(s.transactions).toHaveLength(0);
    s = restoreTransaction(s, removed);
    expect(s.categories[0].balance).toBe(100);
  });
  it('moves money with transfers and reverses them', () => {
    let s = baseState();
    const t = buildTransfer({ from: s.categories[1], to: s.categories[0], amount: 25 });
    s = addTransactions(s, [t]);
    expect(s.categories.map((c) => c.balance)).toEqual([95, 675]);
    s = removeTransaction(s, t.id);
    expect(s.categories.map((c) => c.balance)).toEqual([70, 700]);
  });
  it('treats legacy zero-amount transfers as no-ops', () => {
    const c = cats();
    expect(applyTransactionImpact(c, { type: 'transfer', categoryId: 'system', amount: 0 }, -1)).toEqual(c);
  });
});

describe('cycle renewal', () => {
  it('does nothing before the cycle ends', () => {
    const s = baseState();
    expect(renewCycles(s, new Date(2026, 9, 31, 23)).renewed).toBe(0);
  });
  it('resets weekly budgets with capped rollover and keeps monthly ones mid-month', () => {
    const s = baseState({ cycleStartDate: new Date(2026, 9, 11).toISOString() });
    s.categories[0].balance = 60; // 50% cap = 35
    s.categories[1].balance = 100;
    const { state, renewed } = renewCycles(s, new Date(2026, 9, 19, 9));
    expect(renewed).toBe(1);
    expect(state.categories[0].balance).toBe(105);
    expect(state.categories[1].balance).toBe(100);
    expect(state.weeksTracked).toBe(2);
    expect(localDayKey(state.cycleStartDate)).toBe('2026-10-18');
    expect(state.cycleHistory).toHaveLength(1);
  });
  it('carries overspending forward and resets monthly budgets in a new month', () => {
    const s = baseState(); // started Sun Oct 25
    s.categories[0].balance = -10;
    s.categories[1].balance = 50;
    const { state } = renewCycles(s, new Date(2026, 10, 1, 8));
    expect(state.categories[0].balance).toBe(60);
    expect(state.categories[1].balance).toBe(700 + 50);
  });
  it('catches up several missed weeks', () => {
    const s = baseState({ cycleStartDate: new Date(2026, 9, 4).toISOString() });
    const { state, renewed } = renewCycles(s, new Date(2026, 10, 2));
    expect(renewed).toBe(4);
    expect(state.weeksTracked).toBe(5);
    expect(localDayKey(state.cycleStartDate)).toBe('2026-11-01');
  });
  it('fires recurring templates once per cycle without multiplying', () => {
    let s = baseState({ cycleStartDate: new Date(2026, 9, 4).toISOString() });
    const tpl = buildTransaction({ type: 'expense', amount: 10, category: s.categories[0], recurring: 'weekly', date: new Date(2026, 9, 5).toISOString() });
    s = addTransactions(s, [tpl]);
    let state = s;
    for (const day of [11, 18, 25]) state = renewCycles(state, new Date(2026, 9, day, 9)).state;
    const copies = state.transactions.filter((t) => t.recurringSourceId === tpl.id);
    expect(copies).toHaveLength(3);
    expect(copies.every((t) => t.recurring === 'none')).toBe(true);
    expect(state.transactions.filter((t) => t.recurring === 'weekly')).toHaveLength(1);
  });
  it('previews rollover', () => {
    const s = baseState();
    s.categories[0].balance = 10;
    const p = rolloverPreview(s.categories, s.cycleStartDate);
    expect(p[0].nextBalance).toBe(80);
    expect(p[1].resets).toBe(true); // Oct 25 -> Nov 1 crosses a month
  });
});

describe('storage + migration', () => {
  it('loads legacy keys and de-flags multiplied recurring copies', () => {
    localStorage.setItem(KEYS.categories, JSON.stringify([{ id: '2', name: 'B', limit: '50', balance: '20', frequency: 'weekly' }, { id: '1', name: 'A', limit: 10, balance: 5 }]));
    localStorage.setItem(KEYS.transactions, JSON.stringify([
      { id: 'a', date: '2026-10-01T12:00:00Z', amount: '5', description: 'Gym', categoryId: '1', recurring: 'weekly' },
      { id: 'b', date: '2026-10-08T12:00:00Z', amount: 5, description: '🔁 Gym', categoryId: '1', recurring: 'weekly' }
    ]));
    localStorage.setItem(KEYS.weeksTracked, '7');
    localStorage.setItem(KEYS.currency, '€');
    localStorage.setItem(KEYS.onboarded, 'true');
    const s = loadState();
    expect(s.categories.find((c) => c.id === '2').balance).toBe(20);
    expect(sortCategories(s.categories).map((c) => c.id)).toEqual(['1', '2']);
    expect(s.transactions.map((t) => t.recurring)).toEqual(['none', 'weekly']);
    expect(s.weeksTracked).toBe(7);
    expect(s.prefs.currency).toBe('€');
    expect(s.prefs.onboarded).toBe(true);
  });
  it('starts fresh with default budgets', () => {
    const s = loadState();
    expect(s.categories).toHaveLength(4);
    expect(s.prefs.onboarded).toBe(false);
  });
  it('round-trips through the legacy keys', () => {
    const s = baseState();
    s.prefs.onboarded = true;
    saveState(s);
    expect(JSON.parse(localStorage.getItem(KEYS.categories))).toHaveLength(2);
    expect(localStorage.getItem(KEYS.onboarded)).toBe('true');
    const again = loadState();
    expect(again.categories).toEqual(s.categories);
  });
  it('snapshots legacy data once, without the AI key', () => {
    localStorage.setItem(KEYS.categories, '[]');
    localStorage.setItem(KEYS.geminiKey, 'secret');
    expect(snapshotLegacyData()).toBe(true);
    expect(snapshotLegacyData()).toBe(false);
    expect(localStorage.getItem(KEYS.snapshot)).not.toContain('secret');
  });
});

describe('backup', () => {
  it('round-trips the full state', () => {
    let s = baseState();
    s = addTransactions(s, [buildTransaction({ type: 'expense', amount: 9, category: s.categories[0] })]);
    s.goals = [{ id: 'g', name: 'Trip', target: 500, saved: 50, deposits: [] }];
    const restored = parseBackup(JSON.stringify(createBackup(s)), baseState());
    expect(restored.transactions).toEqual(s.transactions);
    expect(restored.goals[0].saved).toBe(50);
    expect(restored.categories[0].balance).toBe(61);
  });
  it('accepts a legacy (version 2) backup', () => {
    const legacy = { version: 2, categories: cats(), transactions: [], weeksTracked: 3, savingsGoals: [{ id: 'g', name: 'X', target: '100', saved: '10' }], dailySpendLimit: 40 };
    const r = parseBackup(JSON.stringify(legacy), baseState());
    expect(r.weeksTracked).toBe(3);
    expect(r.goals[0].target).toBe(100);
    expect(r.prefs.dailyLimit).toBe(40);
  });
  it('rejects invalid files', () => {
    expect(() => parseBackup('{"a":1}', baseState())).toThrow();
    expect(() => parseBackup('nope', baseState())).toThrow();
  });
  it('escapes CSV cells', () => {
    const csv = transactionsToCsv([{ date: '2026-10-01T12:00:00Z', description: 'a, "b"', categoryName: '=cmd', amount: 3, type: 'expense' }]);
    expect(csv.split('\n')[1]).toBe('2026-10-01,"a, ""b""","=cmd",3,expense,none,');
  });
});

describe('analytics', () => {
  const now = new Date(2026, 9, 28, 12); // Wed Oct 28
  it('computes pace, safe-to-spend and month totals', () => {
    let s = baseState();
    s = addTransactions(s, [buildTransaction({ type: 'expense', amount: 20, category: s.categories[0], date: new Date(2026, 9, 27, 10).toISOString() })]);
    const pace = cyclePace({ ...s, now });
    expect(pace.spent).toBe(20);
    expect(pace.budget).toBe(70);
    const o = overview({ ...s, bills: [{ id: 'b', amount: 100, dueDay: 30 }], now });
    expect(o.balance).toBe(750);
    expect(o.unpaidBills).toBe(100);
    expect(o.safeToSpend).toBe(750 - 100 - 50);
    expect(o.monthSpent).toBe(20);
  });
  it('forecasts month end against budget without early-month noise', () => {
    let s = baseState({ cycleStartDate: new Date(2026, 10, 1).toISOString() });
    const nov2 = new Date(2026, 10, 2, 12);
    const budget = 700 + 70 * (30 / 7);
    s = addTransactions(s, [buildTransaction({ type: 'expense', amount: 20, category: s.categories[0], date: nov2.toISOString() })]);
    const o = overview({ ...s, bills: [], now: nov2 });
    expect(o.monthlyBudget).toBeCloseTo(budget, 5);
    // Day 2 of 30: on-plan pace for the rest of the month.
    expect(o.forecastMonthEnd).toBeCloseTo(budget * (2 / 30) - 20, 1);
  });
  it('groups spending by local day', () => {
    const txs = [{ id: 'x', date: '2026-10-28T02:00:00.000Z', amount: 10, categoryId: '1', type: 'expense' }]; // Oct 27 22:00 local
    expect(spentOnDay(txs, new Date(2026, 9, 27, 12))).toBe(10);
    const series = dailySeries(txs, now, 7);
    expect(series.days.find((d) => d.key === '2026-10-27').total).toBe(10);
    const hm = heatmap(txs, now);
    expect(hm.cells.filter(Boolean).find((c) => c.key === '2026-10-27').total).toBe(10);
  });
  it('compares months by category', () => {
    const c = cats();
    const txs = [
      { id: 'a', date: new Date(2026, 9, 2).toISOString(), amount: 30, categoryId: '1', categoryName: 'Grocery', type: 'expense' },
      { id: 'b', date: new Date(2026, 8, 2).toISOString(), amount: 20, categoryId: '1', categoryName: 'Grocery', type: 'expense' }
    ];
    expect(categorySpending(txs, c, now)[0].amount).toBe(30);
    const cmp = monthComparison(txs, c, now);
    expect(cmp.rows[0].change).toBe(50);
  });
  it('tracks bills and subscriptions', () => {
    const b = billsWithStatus([{ id: '1', amount: 10, dueDay: 31 }, { id: '2', amount: 5, dueDay: 1, lastPaidMonth: '2026-9' }], new Date(2026, 10, 30));
    expect(b.find((x) => x.id === '1').dueDate.getDate()).toBe(30); // clipped to November's last day
    expect(b[0].isOverdue).toBe(true); // bill 2 was paid for October, not November
    expect(advanceDue('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(advanceDue('2026-10-28', 'weekly')).toBe('2026-11-04');
    expect(upcomingSubscriptions([{ active: true, nextDue: '2026-10-30' }, { active: true, nextDue: '2026-12-30' }], now)).toHaveLength(1);
  });
  it('counts and resets streaks', () => {
    expect(updateStreak({ streak: 4, lastDate: '2026-10-27', todaySpent: 5, dailyLimit: 10, now })).toEqual({ streak: 5, lastDate: '2026-10-28' });
    expect(updateStreak({ streak: 4, lastDate: '2026-10-20', todaySpent: 5, dailyLimit: 10, now }).streak).toBe(1);
    expect(updateStreak({ streak: 4, lastDate: '2026-10-28', todaySpent: 5, dailyLimit: 10, now })).toBeNull();
  });
});

describe('gemini helpers', () => {
  it('extracts JSON from chatty replies', () => {
    expect(extractJson('```json\n{"amount": 5}\n```')).toEqual({ amount: 5 });
    expect(extractJson('Sure! [{"id":"1","newLimit":50}] hope that helps')).toEqual([{ id: '1', newLimit: 50 }]);
  });
});
