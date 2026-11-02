import { useMemo, useRef, useState } from 'react';
import {
  Upload, FileText, X, ChevronDown, ChevronRight, Check, CircleAlert, ArrowLeft, Sparkles, History, ShieldCheck, Wand2, Undo2, ListChecks, Plus
} from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { useFeedback } from '../ui/feedback.jsx';
import {
  parseStatement, buildReview, assignCategory, buildImportTransactions, summarise, suggestAccountLabel, suggestBudgets
} from '../lib/importer.js';
import { learnRule } from '../lib/merchants.js';
import { decodePack } from '../lib/importpack.js';
import { localDayKey, dateFromDayKey, formatShortDate } from '../lib/dates.js';
import { newId } from '../lib/transactions.js';
import { roundMoney } from '../lib/money.js';
import { Card, Button, Sheet, TextInput, Segmented, Toggle, Badge, EmptyState, IconButton, Chip, cx } from '../ui/primitives.jsx';
import { tintFor } from '../ui/icons.jsx';
import { CategoryBadge, CategoryPicker, useMoney, useSortedCategories } from './shared.jsx';
import CategoryEditor from './CategoryEditor.jsx';

const PAGE = 60;
const SOURCE_LABEL = { rule: 'Your rule', history: 'Learned', guess: 'Suggested', bank: 'Bank category' };

const readFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsText(file);
});

export default function Import() {
  const { state, actions, now } = useStore();
  const nav = useNav();
  const { notify } = useFeedback();
  const money = useMoney();
  const [files, setFiles] = useState([]); // { id, name, text, account, options, parsed }
  const [overrides, setOverrides] = useState({}); // itemId -> partial item
  const [choices, setChoices] = useState({}); // merchant key -> { categoryId, always, skip }
  const [tab, setTab] = useState('ready');
  const [limit, setLimit] = useState(PAGE);
  const [chooser, setChooser] = useState(null);
  const [done, setDone] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const addFiles = async (list) => {
    const incoming = [...list].slice(0, 12);
    const loaded = await Promise.all(incoming.map(async (file) => {
      try {
        const text = await readFile(file);
        const first = parseStatement(text, file.name);
        const profile = first.signature ? state.importProfiles[first.signature] : null;
        const options = profile ? { flip: !!profile.flip, dateOrder: profile.dateOrder || undefined } : {};
        const parsed = profile ? parseStatement(text, file.name, options) : first;
        return {
          id: newId(), name: file.name, text, options, parsed,
          account: profile?.label || (parsed.error ? '' : suggestAccountLabel(parsed, file.name))
        };
      } catch (err) {
        return { id: newId(), name: file.name, text: '', options: {}, parsed: { error: err.message }, account: '' };
      }
    }));
    setFiles((f) => [...f, ...loaded]);
    setOverrides({});
    setLimit(PAGE);
    if (inputRef.current) inputRef.current.value = '';
  };

  const updateFile = (id, patch) => {
    setFiles((list) => list.map((f) => {
      if (f.id !== id) return f;
      const next = { ...f, ...patch };
      if (patch.options) next.parsed = parseStatement(f.text, f.name, { ...f.options, ...patch.options });
      if (patch.options) next.options = { ...f.options, ...patch.options };
      return next;
    }));
    setOverrides({});
  };

  const usable = files.filter((f) => !f.parsed.error && f.parsed.rows?.length);
  const baseItems = useMemo(
    () => buildReview({ files: usable.map((f) => ({ id: f.id, account: f.account.trim() || 'Card', parsed: f.parsed })), state, now }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [files, state.transactions, state.categories, state.importRules, state.cycleStartDate]
  );
  const items = useMemo(() => baseItems.map((it) => {
    let next = it;
    const choice = choices[it.key || `id:${it.id}`] || (!it.key && choices[`group:${it.account}|${it.merchant}`]);
    if (choice && it.status !== 'skipped' && it.kind !== 'payment') {
      next = choice.skip ? { ...next, include: false, status: 'skipped', reason: 'Skipped by you' } : assignCategory(next, choice.categoryId, state);
    }
    if (overrides[it.id]) next = { ...next, ...overrides[it.id] };
    return next;
  }), [baseItems, choices, overrides, state]);

  const summary = summarise(items);
  const groups = {
    ready: items.filter((i) => i.include),
    needs: items.filter((i) => !i.include && i.status === 'needs'),
    deposit: items.filter((i) => !i.include && i.status === 'deposit'),
    skipped: items.filter((i) => !i.include && i.status === 'skipped')
  };
  const visible = groups[tab] || [];
  const budgetIdeas = useMemo(() => suggestBudgets(items, state.categories), [items, state.categories]);
  const hasETransfers = items.some((i) => /^E-Transfer (to|from) /.test(i.merchant));

  const toggle = (item) => {
    if (!item.categoryId) { setChooser(item); return; }
    setOverrides((o) => ({ ...o, [item.id]: { ...o[item.id], include: !item.include } }));
  };

  const confirm = () => {
    const batchId = newId();
    const txs = buildImportTransactions(items, state, batchId);
    if (!txs.length) return;
    let rules = state.importRules;
    let learned = 0;
    Object.entries(choices).forEach(([key, c]) => {
      if (!c.always || key.startsWith('id:') || key.startsWith('group:')) return;
      rules = learnRule(rules, { key, categoryId: c.skip ? null : c.categoryId, action: c.skip ? 'skip' : 'categorize' });
      learned += 1;
    });
    // Confirming a suggestion also teaches it, so next time it's automatic.
    items.forEach((it) => {
      if (!it.include || !it.key || choices[it.key] || it.suggestion?.source === 'rule' || it.direction !== 'out') return;
      const before = rules;
      rules = learnRule(rules, { key: it.key, categoryId: it.categoryId });
      if (rules !== before) learned += 1;
    });
    const profiles = {};
    usable.forEach((f) => {
      profiles[f.parsed.signature] = {
        label: f.account.trim() || 'Card',
        flip: !!f.options.flip,
        dateOrder: f.options.dateOrder || null,
        lastImport: localDayKey(now),
        lastTo: f.parsed.to,
        bank: f.parsed.bank || ''
      };
    });
    actions.importBatch({ transactions: txs, rules, profiles });
    const byBudget = {};
    txs.forEach((t) => {
      const b = byBudget[t.categoryId] || { spent: 0, credits: 0 };
      if (t.type === 'income') b.credits = roundMoney(b.credits + t.amount); else b.spent = roundMoney(b.spent + t.amount);
      byBudget[t.categoryId] = b;
    });
    setDone({ batchId, count: txs.length, spend: summary.spend, credits: summary.credits, byBudget, learned, historyOnly: txs.filter((t) => t.affectsBalance === false).length });
    setFiles([]);
    setChoices({});
    setOverrides({});
    window.scrollTo({ top: 0 });
  };

  if (done) {
    return (
      <div className="space-y-5 pt-2">
        <Card className="p-6 text-center">
          <span className="w-14 h-14 rounded-full bg-accent-soft text-accent-strong inline-flex items-center justify-center"><Check size={28} /></span>
          <h2 className="text-xl font-semibold mt-3">Added {done.count} {done.count === 1 ? 'entry' : 'entries'}</h2>
          <p className="text-sm text-muted mt-1">
            {money(done.spend)} spent{done.credits ? ` · ${money(done.credits)} refunds/credits` : ''}
            {done.learned ? ` · ${done.learned} merchant${done.learned === 1 ? '' : 's'} learned` : ''}
          </p>
          {done.historyOnly > 0 && <p className="text-xs text-subtle mt-2">{done.historyOnly} older {done.historyOnly === 1 ? 'entry was' : 'entries were'} added to history only, so current budgets weren't changed by them.</p>}
        </Card>
        <Card className="divide-y divide-[var(--border)]">
          {Object.entries(done.byBudget).sort((a, b) => b[1].spent - a[1].spent).map(([id, t]) => {
            const c = state.categories.find((x) => x.id === id);
            return (
              <div key={id} className="flex items-center gap-3 px-4 py-3">
                <CategoryBadge category={c} size={36} iconSize={18} />
                <span className="flex-1 text-[15px] font-medium">{c?.name || 'Budget'}</span>
                <span className="text-right tabular">
                  {t.spent > 0 && <span className="block text-[15px] font-semibold">{money(t.spent)}</span>}
                  {t.credits > 0 && <span className="block text-xs font-medium text-accent-strong">+{money(t.credits)} refunded</span>}
                </span>
              </div>
            );
          })}
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => { actions.undoImport(done.batchId); notify(`Removed ${done.count} imported entries`); setDone(null); }}><Undo2 size={17} /> Undo import</Button>
          <Button onClick={() => nav.go('activity')}>See in Activity</Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setDone(null)}>Import more files</Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2 pb-24">
      <button type="button" onClick={() => nav.go('activity')} className="inline-flex items-center gap-1 text-sm font-medium text-muted h-9"><ArrowLeft size={16} /> Activity</button>

      {/* File picker */}
      <Card
        className={cx('p-5 border-dashed border-2 transition', dragging ? 'border-accent bg-accent-soft' : 'border-line-strong')}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
      >
        <div className="flex items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-accent-soft text-accent-strong flex items-center justify-center shrink-0"><Upload size={22} /></span>
          <div className="flex-1 min-w-0">
            <p className="font-semibold">{files.length ? 'Add more statements' : 'Import bank & card statements'}</p>
            <p className="text-sm text-muted">CSV, OFX, QFX or QBO from any bank. You can pick several files at once.</p>
          </div>
        </div>
        <Button className="w-full mt-4" onClick={() => inputRef.current?.click()}><FileText size={18} /> Choose files</Button>
        <input ref={inputRef} type="file" multiple hidden onChange={(e) => addFiles(e.target.files)} data-testid="import-input" />
        <p className="text-xs text-subtle mt-3 flex items-center gap-1.5"><ShieldCheck size={14} /> Files are read on this device. Nothing is uploaded.</p>
      </Card>

      {!files.length && <PasteCode onDone={(r) => setDone(r)} />}
      {!files.length && <HowTo profiles={state.importProfiles} />}

      {/* Files */}
      {files.map((f) => <FileCard key={f.id} file={f} onChange={(patch) => updateFile(f.id, patch)} onRemove={() => { setFiles((l) => l.filter((x) => x.id !== f.id)); setOverrides({}); }} />)}

      {usable.length > 0 && (
        <>
          {!state.prefs.name && hasETransfers && <NamePrompt />}
          {budgetIdeas.length > 0 && <BudgetIdeas ideas={budgetIdeas} />}

          <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-surface-2 border border-line" role="tablist" aria-label="Review groups">
            {[['ready', 'Adding', groups.ready.length], ['needs', 'Need budget', groups.needs.length], ['deposit', 'Deposits', groups.deposit.length], ['skipped', 'Skipped', groups.skipped.length]].map(([id, label, n]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => { setTab(id); setLimit(PAGE); }}
                className={cx('rounded-xl py-2 px-1 text-center transition', tab === id ? 'bg-surface shadow-card text-ink' : 'text-muted')}
              >
                <span className={cx('block text-lg font-semibold tabular leading-tight', id === 'needs' && n > 0 && 'text-warn')}>{n}</span>
                <span className="block text-[11px] font-medium">{label}</span>
              </button>
            ))}
          </div>

          <p className="text-sm text-muted px-1">
            {tab === 'ready' && 'These will be added. Tap a budget to change it, or the tick to leave one out.'}
            {tab === 'needs' && "BudgetFlow couldn't guess these. Pick a budget and it'll remember the merchant next time."}
            {tab === 'deposit' && "Pay, interest and other money in aren't added to budgets unless you choose one."}
            {tab === 'skipped' && 'Card payments, transfers, duplicates and entries you already logged. Tap the tick to add one anyway.'}
          </p>

          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {visible.length === 0 ? (
              <EmptyState icon={<ListChecks size={22} />} title="Nothing here" body={tab === 'needs' ? 'Every entry has a budget.' : undefined} />
            ) : visible.slice(0, limit).map((it) => (
              <ReviewRow key={it.id} item={it} onToggle={() => toggle(it)} onChoose={() => setChooser(it)} showAccount={usable.length > 1} />
            ))}
          </Card>
          {visible.length > limit && <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>Show more ({visible.length - limit})</Button>}
        </>
      )}

      {usable.length > 0 && (
        <div className="fixed inset-x-0 lg:left-64 z-40 px-4 no-print bottom-[calc(env(safe-area-inset-bottom)+84px)] lg:bottom-6">
          <div className="mx-auto max-w-[688px]">
            <Button size="lg" className="w-full shadow-pop" onClick={confirm} disabled={!summary.included}>
              {summary.included ? `Add ${summary.included} ${summary.included === 1 ? 'entry' : 'entries'} · ${money(summary.spend)}` : 'Nothing selected'}
            </Button>
          </div>
        </div>
      )}

      <CategoryChooser
        item={chooser}
        count={chooser ? items.filter((i) => i.status !== 'skipped' && (chooser.key ? i.key === chooser.key : !i.key && i.account === chooser.account && i.merchant === chooser.merchant)).length : 0}
        onClose={() => setChooser(null)}
        onPick={({ categoryId, always, skip, applyAll }) => {
          const choiceKey = chooser.key || (applyAll ? `group:${chooser.account}|${chooser.merchant}` : `id:${chooser.id}`);
          setChoices((c) => ({ ...c, [choiceKey]: { categoryId, always: always && !!chooser.key, skip } }));
          setOverrides((o) => {
            const next = { ...o };
            items.filter((i) => (i.key || `id:${i.id}`) === choiceKey || (!i.key && choiceKey === `group:${i.account}|${i.merchant}`)).forEach((i) => { delete next[i.id]; });
            if (chooser.status === 'skipped' && !skip) next[chooser.id] = { ...assignCategory({ ...chooser, status: 'ready' }, categoryId, state), reason: '' };
            return next;
          });
          setChooser(null);
        }}
      />
    </div>
  );
}

function PasteCode({ onDone }) {
  const { actions } = useStore();
  const { notify } = useFeedback();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const pack = await decodePack(code);
      const r = actions.importPack(pack);
      if (!r.added) { notify('Everything in that code is already in BudgetFlow', { tone: 'info' }); return; }
      const byBudget = {};
      r.transactions.forEach((t) => {
        const b = byBudget[t.categoryId] || { spent: 0, credits: 0 };
        if (t.type === 'income') b.credits = roundMoney(b.credits + t.amount); else b.spent = roundMoney(b.spent + t.amount);
        byBudget[t.categoryId] = b;
      });
      onDone({
        batchId: r.batchId, count: r.added, byBudget, learned: (pack.rules || []).length,
        spend: roundMoney(r.transactions.filter((t) => t.type !== 'income').reduce((s2, t) => s2 + t.amount, 0)),
        credits: roundMoney(r.transactions.filter((t) => t.type === 'income').reduce((s2, t) => s2 + t.amount, 0)),
        historyOnly: r.transactions.filter((t) => t.affectsBalance === false).length
      });
      setCode('');
    } catch (err) {
      notify(err.message, { tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="p-4">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between h-9 text-left" aria-expanded={open}>
        <span className="font-medium">Have an import code or link?</span>
        {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {open && (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-muted">Paste the whole link or code. Entries already in BudgetFlow are skipped.</p>
          <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={4} aria-label="Import code" placeholder="https://…#/import?pack=…"
            className="w-full px-4 py-3 rounded-2xl bg-surface-2 border border-line text-ink text-sm font-mono outline-none focus:border-accent resize-none" />
          <Button className="w-full" onClick={run} loading={busy} disabled={!code.trim()}>Import</Button>
        </div>
      )}
    </Card>
  );
}

function NamePrompt() {
  const { actions } = useStore();
  const [name, setName] = useState('');
  return (
    <Card className="p-4">
      <p className="font-medium">What's your name?</p>
      <p className="text-sm text-muted mt-0.5">E-transfers to and from yourself (between your own banks) are then skipped instead of counted as spending.</p>
      <div className="flex gap-2 mt-3">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" aria-label="Your name" />
        <Button variant="secondary" onClick={() => name.trim() && actions.setPrefs({ name: name.trim() })} disabled={!name.trim()}>Save</Button>
      </div>
    </Card>
  );
}

function BudgetIdeas({ ideas }) {
  const { actions } = useStore();
  const { notify } = useFeedback();
  const money = useMoney();
  const [picked, setPicked] = useState(() => new Set(ideas.map((i) => i.concept)));
  const toggle = (c) => setPicked((p) => { const n = new Set(p); if (n.has(c)) n.delete(c); else n.add(c); return n; });
  const create = () => {
    const chosen = ideas.filter((i) => picked.has(i.concept));
    chosen.forEach((i) => actions.addCategory({ name: i.name, limit: i.limit, balance: i.limit, frequency: i.frequency, icon: i.icon, color: i.color }));
    notify(`Added ${chosen.length} budget${chosen.length === 1 ? '' : 's'} — entries sorted`);
  };
  const total = ideas.reduce((s, i) => s + i.count, 0);
  return (
    <Card className="p-4">
      <p className="font-medium">Add budgets for {total} unsorted entries?</p>
      <p className="text-sm text-muted mt-0.5">Amounts are based on what you spent in these statements. You can change them later.</p>
      <div className="mt-3 divide-y divide-[var(--border)]">
        {ideas.map((i) => (
          <label key={i.concept} className="flex items-center gap-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={picked.has(i.concept)} onChange={() => toggle(i.concept)} className="w-5 h-5 accent-[var(--accent)]" />
            <CategoryBadge category={{ icon: i.icon, color: i.color, name: i.name }} size={32} iconSize={16} />
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-medium">{i.name}</span>
              <span className="block text-xs text-muted">{i.count} {i.count === 1 ? 'entry' : 'entries'}</span>
            </span>
            <span className="text-sm text-muted tabular">{money(i.limit)}/{i.frequency === 'weekly' ? 'wk' : 'mo'}</span>
          </label>
        ))}
      </div>
      <Button className="w-full mt-3" onClick={create} disabled={!picked.size}>Add {picked.size} budget{picked.size === 1 ? '' : 's'}</Button>
    </Card>
  );
}

function ReviewRow({ item, onToggle, onChoose, showAccount }) {
  const { state } = useStore();
  const money = useMoney();
  const category = state.categories.find((c) => c.id === item.categoryId);
  const tint = category ? tintFor(category) : null;
  return (
    <div className="flex items-start gap-3 px-3 py-3">
      <button
        type="button"
        onClick={onToggle}
        role="checkbox"
        aria-checked={item.include}
        aria-label={`${item.include ? 'Leave out' : 'Add'} ${item.merchant} ${money(item.amount)}`}
        className={cx('mt-0.5 w-7 h-7 rounded-lg border-2 inline-flex items-center justify-center shrink-0 transition', item.include ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong')}
      >
        {item.include && <Check size={16} strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15px] font-medium leading-snug truncate">{item.merchant || item.raw}</p>
          <p className={cx('text-[15px] font-semibold tabular whitespace-nowrap', item.direction === 'in' ? 'text-accent-strong' : 'text-ink')}>
            {item.direction === 'in' ? '+' : '−'}{money(item.amount).replace('−', '')}
          </p>
        </div>
        <p className="text-xs text-muted truncate mt-0.5" title={item.raw}>
          {formatShortDate(dateFromDayKey(item.date))}{showAccount ? ` · ${item.account}` : ''} · {item.raw}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {item.kind !== 'payment' && (
            <button
              type="button"
              onClick={onChoose}
              className={cx('h-8 pl-2 pr-2.5 rounded-full text-[13px] font-medium inline-flex items-center gap-1.5 border transition', category ? 'border-transparent' : 'border-dashed border-warn text-warn')}
              style={category ? { background: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint } : undefined}
              aria-label={category ? `Budget: ${category.name}. Change` : `Choose a budget for ${item.merchant}`}
            >
              {category ? <><CategoryBadge category={category} size={20} iconSize={12} />{category.name}</> : 'Choose budget'}
              <ChevronDown size={14} />
            </button>
          )}
          {item.suggestion && item.categoryId === item.suggestion.categoryId && <Badge>{item.suggestion.source === 'rule' ? <Wand2 size={11} /> : <Sparkles size={11} />}{SOURCE_LABEL[item.suggestion.source]}</Badge>}
          {item.kind === 'refund' && <Badge tone="good">Refund</Badge>}
          {item.status === 'skipped' && <Badge tone="neutral">{item.reason}</Badge>}
          {item.historyOnly && item.include && <Badge tone="info"><History size={11} /> History only</Badge>}
          {item.future && <Badge tone="warn">Future date</Badge>}
        </div>
      </div>
    </div>
  );
}

function FileCard({ file, onChange, onRemove }) {
  const [open, setOpen] = useState(false);
  const p = file.parsed;
  if (p.error) {
    return (
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <CircleAlert size={20} className="text-danger shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{file.name}</p>
            <p className="text-sm text-danger mt-0.5">{p.error}</p>
            <p className="text-xs text-muted mt-1">Make sure it's a CSV or OFX/QFX export of transactions (not a PDF statement). If your bank offers several CSV styles, try another.</p>
          </div>
          <IconButton label={`Remove ${file.name}`} size={36} onClick={onRemove}><X size={18} /></IconButton>
        </div>
      </Card>
    );
  }
  const dateLabel = p.from && p.to ? `${formatShortDate(dateFromDayKey(p.from))} – ${formatShortDate(dateFromDayKey(p.to))}` : '';
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-2xl bg-surface-2 text-muted flex items-center justify-center shrink-0"><FileText size={18} /></span>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted mt-0.5">{p.bank ? `${p.bank} · ` : ''}{p.format} · {p.rows.length} entries{dateLabel ? ` · ${dateLabel}` : ''}{p.declined ? ` · ${p.declined} declined left out` : ''}</p>
        </div>
        <IconButton label={`Remove ${file.name}`} size={36} onClick={onRemove}><X size={18} /></IconButton>
      </div>
      <label className="block mt-3">
        <span className="block text-[13px] font-medium text-muted mb-1.5">Which card or account is this?</span>
        <TextInput value={file.account} onChange={(e) => onChange({ account: e.target.value.slice(0, 30) })} placeholder="e.g. Amex Cobalt" aria-label={`Card name for ${file.name}`} />
      </label>
      {p.warnings?.includes('dates-ambiguous') && (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-warn mb-1.5">Dates could be read either way. Which is right?</p>
          <Segmented size="sm" ariaLabel="Date order" value={p.dateOrder || 'MDY'} onChange={(dateOrder) => onChange({ options: { dateOrder } })}
            options={[{ value: 'MDY', label: 'Month/Day' }, { value: 'DMY', label: 'Day/Month' }]} />
        </div>
      )}
      <button type="button" onClick={() => setOpen((o) => !o)} className="mt-3 h-9 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink" aria-expanded={open}>
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Amounts look wrong?
      </button>
      {open && (
        <div className="mt-1 space-y-2">
          <p className="text-xs text-muted">If purchases show up as refunds (green, with +), flip the signs for this file. BudgetFlow remembers it for this bank.</p>
          <Toggle checked={!!p.flipped} onChange={(flip) => onChange({ options: { flip } })} label="Flip money in / money out" />
          {p.dateOrder && !p.warnings?.includes('dates-ambiguous') && (
            <Segmented size="sm" ariaLabel="Date order" value={p.dateOrder} onChange={(dateOrder) => onChange({ options: { dateOrder } })}
              options={[{ value: 'MDY', label: 'Month/Day' }, { value: 'DMY', label: 'Day/Month' }]} />
          )}
          {p.dropped > 0 && <p className="text-xs text-subtle">{p.dropped} row{p.dropped === 1 ? '' : 's'} without a date or amount (like headers or totals) were ignored.</p>}
        </div>
      )}
    </Card>
  );
}

function CategoryChooser({ item, count, onClose, onPick }) {
  const categories = useSortedCategories();
  const money = useMoney();
  const [always, setAlways] = useState(true);
  const [applyAll, setApplyAll] = useState(true);
  const [creating, setCreating] = useState(false);
  if (!item) return null;
  const isIncome = item.direction === 'in';
  const learnable = !!item.key;
  const remember = always && learnable;
  return (
    <>
      <Sheet open={!creating} onClose={onClose} title={item.merchant || 'Choose a budget'}>
        <p className="text-sm text-muted -mt-1 mb-4">{isIncome ? '+' : '−'}{money(item.amount).replace('−', '')} · {formatShortDate(dateFromDayKey(item.date))} · {item.account}</p>
        <CategoryPicker categories={categories} value={item.categoryId} onChange={(categoryId) => onPick({ categoryId, always: remember, applyAll })} showBalance={false} />
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setCreating(true)}><Plus size={16} /> New budget</Button>
        <div className="mt-4 space-y-3">
          {learnable ? (
            <Toggle
              checked={always}
              onChange={setAlways}
              label={`Always use this for ${item.merchant}`}
              description={count > 1 ? `Also applies to the other ${count - 1} ${item.merchant} entries in this import.` : 'Future imports and Apple Pay entries sort automatically.'}
            />
          ) : (
            <>
              {count > 1 && (
                <Toggle
                  checked={applyAll}
                  onChange={setApplyAll}
                  label={`Use for all ${count} “${item.merchant}” entries from ${item.account}`}
                  description="Your bank doesn't say where these were spent, so this applies to this import only."
                />
              )}
              {count <= 1 && <p className="text-xs text-subtle">Your bank doesn't say where this was spent, so it can't be remembered for next time.</p>}
            </>
          )}
          {!isIncome && (
            <Button variant="secondary" className="w-full" onClick={() => onPick({ categoryId: null, always: remember, skip: true, applyAll })}>
              {remember ? `Always skip ${item.merchant}` : !learnable && applyAll && count > 1 ? `Skip all ${count}` : 'Skip this one'}
            </Button>
          )}
        </div>
      </Sheet>
      <CategoryEditor
        open={creating}
        category={null}
        onClose={() => setCreating(false)}
        onCreated={(categoryId) => { setCreating(false); onPick({ categoryId, always: remember, applyAll }); }}
      />
    </>
  );
}

function HowTo({ profiles }) {
  const [open, setOpen] = useState(false);
  const recent = Object.values(profiles || {}).filter((p) => p.lastImport).sort((a, b) => b.lastImport.localeCompare(a.lastImport));
  return (
    <>
      {recent.length > 0 && (
        <Card className="divide-y divide-[var(--border)]">
          <p className="px-4 pt-3 pb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle">Last imported</p>
          {recent.map((p) => (
            <div key={`${p.label}-${p.lastImport}`} className="flex justify-between px-4 py-3 text-[15px]">
              <span className="font-medium">{p.label}</span>
              <span className="text-muted text-sm">up to {p.lastTo ? formatShortDate(dateFromDayKey(p.lastTo)) : '—'} · imported {formatShortDate(dateFromDayKey(p.lastImport))}</span>
            </div>
          ))}
          <p className="px-4 py-3 text-xs text-subtle">Downloading overlapping dates is fine. Entries already imported are skipped automatically.</p>
        </Card>
      )}
      <Card className="p-4">
        <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between h-9 text-left" aria-expanded={open}>
          <span className="font-medium">How do I get the file?</span>
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {open && (
          <div className="text-sm text-muted space-y-3 mt-2 leading-relaxed">
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Sign in to your bank or card <b className="text-ink">website</b> (banking apps usually can't export).</li>
              <li>Open the card or account and find <b className="text-ink">Download</b>, <b className="text-ink">Export</b> or the download icon near your transactions.</li>
              <li>Pick a date range (e.g. since your last import) and the <b className="text-ink">CSV</b> format. It may be called <i>Spreadsheet</i>, <i>Excel (CSV)</i> or <i>Comma-separated</i>. <b className="text-ink">QFX / OFX</b> (Quicken or Money) works too.</li>
              <li>Come back here and choose the files. On a phone they're usually in <i>Files → Downloads</i>.</li>
            </ol>
            <p>Works with exports from RBC, TD, Scotiabank, CIBC, BMO, Tangerine, Simplii, Amex, Capital One, PC Financial, National Bank, Desjardins and most others. PDF statements can't be read. Download the CSV instead.</p>
            <p className="flex items-start gap-2"><Chip className="pointer-events-none shrink-0">Tip</Chip><span>Do it once a week: download each card's recent activity and import them all together. It takes a couple of minutes.</span></p>
          </div>
        )}
      </Card>
    </>
  );
}
