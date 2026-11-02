import { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Mic, Camera, Plus, X, Repeat, ArrowDown } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useFeedback } from '../ui/feedback.jsx';
import { parseAmount, roundMoney } from '../lib/money.js';
import { localDayKey, addDays, isoForDay } from '../lib/dates.js';
import { buildTransaction, buildTransfer, INCOME_CATEGORY } from '../lib/transactions.js';
import { spentOnDay } from '../lib/analytics.js';
import { callGemini, extractJson, prompts, fileToBase64 } from '../lib/gemini.js';
import { Sheet, Segmented, MoneyInput, TextInput, Chip, Button, Field, cx } from '../ui/primitives.jsx';
import { CatIcon, tintFor } from '../ui/icons.jsx';
import { CategoryPicker, useMoney, useSortedCategories } from './shared.jsx';

const PRESETS = [5, 10, 20, 50];
const blankLine = () => ({ categoryId: '', amount: '', description: '' });

export default function AddSheet({ state: open, onClose }) {
  const { state, actions, now } = useStore();
  const { notify, ask } = useFeedback();
  const money = useMoney();
  const categories = useSortedCategories();
  const [mode, setMode] = useState('expense');
  const [form, setForm] = useState({});
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [splitLabel, setSplitLabel] = useState('');
  const [transfer, setTransfer] = useState({ fromId: '', toId: '', amount: '' });
  const [newTag, setNewTag] = useState('');
  const [error, setError] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const p = open.prefill || {};
    setMode(open.type || 'expense');
    setForm({
      amount: p.amount !== undefined ? String(p.amount) : '',
      description: p.description || '',
      categoryId: open.categoryId || p.categoryId || '',
      day: p.day || localDayKey(new Date()),
      recurring: p.recurring || 'none',
      tags: p.tags || [],
      extra: p.extra || null
    });
    setLines([blankLine(), blankLine()]);
    setSplitLabel('');
    setTransfer({ fromId: open.categoryId || '', toId: '', amount: '' });
    setError('');
    setAiText('');
    setNewTag('');
  }, [open]);

  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(''); };
  const today = localDayKey(now);
  const yesterday = localDayKey(addDays(now, -1));
  const hasAI = !!state.prefs.geminiKey;

  const amountNum = parseAmount(form.amount);
  const splitTotal = useMemo(() => lines.reduce((s, l) => s + (parseAmount(l.amount) || 0), 0), [lines]);

  const saveEntry = async () => {
    const category = mode === 'income' ? INCOME_CATEGORY : state.categories.find((c) => c.id === form.categoryId);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return setError('Enter an amount above zero.');
    if (!category) return setError('Choose a budget.');
    const isExpense = mode === 'expense';
    if (isExpense) {
      const { alertThreshold, dailyLimit } = state.prefs;
      if (alertThreshold > 0 && amountNum > alertThreshold) {
        const ok = await ask({ title: 'Large expense', message: `${money(amountNum)} is above your ${money(alertThreshold)} alert. Save it anyway?`, confirmLabel: 'Save anyway' });
        if (!ok) return undefined;
      }
      if (dailyLimit > 0 && form.day === today) {
        const total = spentOnDay(state.transactions, now) + amountNum;
        if (total > dailyLimit) {
          const ok = await ask({ title: 'Daily limit', message: `This brings today's spending to ${money(total)}, over your ${money(dailyLimit)} daily limit. Save it anyway?`, confirmLabel: 'Save anyway' });
          if (!ok) return undefined;
        }
      }
    }
    const tx = buildTransaction({
      type: mode,
      amount: amountNum,
      description: form.description,
      category,
      date: isoForDay(form.day, new Date()),
      recurring: form.recurring,
      tags: form.tags,
      extra: form.extra || {}
    });
    actions.addTransactions([tx]);
    onClose();
    notify(isExpense ? `${money(tx.amount)} spent on ${category.name}` : `${money(tx.amount)} income recorded`, {
      actionLabel: 'Undo',
      onAction: () => actions.deleteTransaction(tx.id)
    });
    return undefined;
  };

  const saveTransfer = () => {
    const from = state.categories.find((c) => c.id === transfer.fromId);
    const to = state.categories.find((c) => c.id === transfer.toId);
    const amount = parseAmount(transfer.amount);
    if (!from || !to) return setError('Choose both budgets.');
    if (from.id === to.id) return setError('Pick two different budgets.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount above zero.');
    const tx = buildTransfer({ from, to, amount });
    actions.addTransactions([tx]);
    onClose();
    notify(`Moved ${money(amount)} from ${from.name} to ${to.name}`, { actionLabel: 'Undo', onAction: () => actions.deleteTransaction(tx.id) });
    return undefined;
  };

  const saveSplit = () => {
    const valid = lines.filter((l) => l.categoryId && parseAmount(l.amount) > 0);
    if (valid.length < 2) return setError('Add at least two lines with a budget and an amount.');
    const date = new Date().toISOString();
    const label = splitLabel.trim() || 'Split';
    const txs = valid.map((l) => {
      const category = state.categories.find((c) => c.id === l.categoryId);
      return buildTransaction({
        type: 'expense', amount: parseAmount(l.amount), category, date,
        description: `${label}: ${l.description.trim() || category.name}`, extra: { isSplit: true }
      });
    });
    actions.addTransactions(txs);
    onClose();
    notify(`Split ${money(roundMoney(splitTotal))} across ${txs.length} budgets`, {
      actionLabel: 'Undo',
      onAction: () => txs.forEach((t) => actions.deleteTransaction(t.id))
    });
    return undefined;
  };

  const submit = (e) => {
    e?.preventDefault();
    if (mode === 'transfer') return saveTransfer();
    if (mode === 'split') return saveSplit();
    return saveEntry();
  };

  // ---- AI assist ----
  const applyParsed = (d) => {
    const amount = Number(d?.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('No amount found');
    const cat = state.categories.find((c) => c.id === String(d.categoryId)) || state.categories.find((c) => c.name.toLowerCase() === String(d.categoryId || '').toLowerCase());
    if (d.type === 'income' || d.type === 'expense') setMode(d.type);
    set({ amount: String(roundMoney(amount)), description: d.description || form.description, categoryId: cat?.id || form.categoryId });
  };
  const runMagic = async (text) => {
    const input = (text ?? aiText).trim();
    if (!input) return;
    setAiBusy(true);
    try {
      const reply = await callGemini({ apiKey: state.prefs.geminiKey, model: state.prefs.aiModel, prompt: prompts.parseEntry(input, state.categories) });
      applyParsed(extractJson(reply));
      setAiText('');
    } catch (err) {
      notify(err.message?.startsWith('Gemini') || err.message?.startsWith('Could not') ? err.message : 'Could not understand that — try "12.50 coffee".', { tone: 'bad' });
    } finally {
      setAiBusy(false);
    }
  };
  const scanReceipt = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAiBusy(true);
    try {
      const image = await fileToBase64(file);
      const reply = await callGemini({ apiKey: state.prefs.geminiKey, model: state.prefs.aiModel, prompt: prompts.receipt(state.categories), image });
      applyParsed(extractJson(reply));
      notify('Receipt read — check the details and save');
    } catch (err) {
      notify('Could not read that receipt.', { tone: 'bad' });
    } finally {
      setAiBusy(false);
    }
  };
  const SpeechRecognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
  const listen = () => {
    if (!SpeechRecognition) return;
    const rec = new SpeechRecognition();
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = false;
    setListening(true);
    rec.onresult = (ev) => {
      const said = ev.results[0][0].transcript;
      setAiText(said);
      runMagic(said);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  };

  const toggleTag = (tag) => set({ tags: form.tags?.includes(tag) ? form.tags.filter((t) => t !== tag) : [...(form.tags || []), tag] });
  const addTag = () => {
    const tag = newTag.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    if (!tag) return;
    if (!state.tags.includes(tag)) actions.setTags([...state.tags, tag]);
    if (!form.tags?.includes(tag)) set({ tags: [...(form.tags || []), tag] });
    setNewTag('');
  };

  const title = { expense: 'New expense', income: 'New income', transfer: 'Move money', split: 'Split expense' }[mode];
  const cta = mode === 'transfer' ? 'Move money'
    : mode === 'split' ? `Save split${splitTotal > 0 ? ` · ${money(roundMoney(splitTotal))}` : ''}`
      : `${mode === 'income' ? 'Add income' : 'Add expense'}${amountNum > 0 ? ` · ${money(roundMoney(amountNum))}` : ''}`;

  return (
    <Sheet open={!!open} onClose={onClose} title={title} footer={<Button size="lg" className="w-full" onClick={submit}>{cta}</Button>}>
      <form onSubmit={submit} className="space-y-5">
        <Segmented
          ariaLabel="Entry type"
          value={mode}
          onChange={(m) => { setMode(m); setError(''); }}
          options={[
            { value: 'expense', label: 'Expense' },
            { value: 'income', label: 'Income' },
            { value: 'transfer', label: 'Move' },
            { value: 'split', label: 'Split' }
          ]}
        />

        {(mode === 'expense' || mode === 'income') && (
          <>
            {hasAI && (
              <div className="rounded-2xl bg-surface-2 border border-line p-2 flex items-center gap-1.5">
                <Sparkles size={18} className="text-accent ml-2 shrink-0" aria-hidden="true" />
                <input
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); runMagic(); } }}
                  placeholder={listening ? 'Listening…' : 'Describe it: "12.50 lunch with Sam"'}
                  aria-label="Describe the entry for AI"
                  className="flex-1 min-w-0 h-10 bg-transparent outline-none text-ink placeholder:text-subtle px-1"
                />
                {aiText.trim() ? (
                  <Button size="sm" onClick={() => runMagic()} loading={aiBusy}>Fill</Button>
                ) : (
                  <>
                    {SpeechRecognition && (
                      <button type="button" onClick={listen} aria-label="Speak the entry" className={cx('w-10 h-10 rounded-xl inline-flex items-center justify-center', listening ? 'bg-danger-soft text-danger' : 'text-muted hover:text-ink')}>
                        <Mic size={18} />
                      </button>
                    )}
                    <button type="button" onClick={() => fileRef.current?.click()} aria-label="Scan a receipt" className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-muted hover:text-ink" disabled={aiBusy}>
                      {aiBusy ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent anim-spin" /> : <Camera size={18} />}
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={scanReceipt} />
                  </>
                )}
              </div>
            )}

            <div>
              <MoneyInput
                symbol={money.symbol}
                value={form.amount ?? ''}
                onChange={(e) => set({ amount: e.target.value })}
                placeholder="0.00"
                aria-label="Amount"
                data-autofocus
                inputClassName="h-16 text-3xl font-semibold"
                className="[&>span]:text-2xl"
              />
              <div className="flex gap-2 mt-2.5">
                {PRESETS.map((p) => (
                  <Chip key={p} active={amountNum === p} onClick={() => set({ amount: String(p) })} className="flex-1 justify-center">{money(p)}</Chip>
                ))}
              </div>
            </div>

            {mode === 'income' ? (
              <p className="text-sm text-muted rounded-2xl bg-surface-2 border border-line px-4 py-3">Income is recorded for your insights and savings rate. It isn't added to a budget, so it won't change what you have left to spend. To top up a budget, edit the budget or use <b className="text-ink">Move</b>.</p>
            ) : (
            <div>
              <p className="text-[13px] font-medium text-muted mb-2">Budget</p>
              <CategoryPicker categories={categories} value={form.categoryId} onChange={(categoryId) => set({ categoryId })} />
            </div>
            )}

            <Field label="Note">
              <TextInput value={form.description ?? ''} onChange={(e) => set({ description: e.target.value })} placeholder={mode === 'income' ? 'e.g. Paycheque' : 'e.g. Coffee'} maxLength={80} />
            </Field>

            <div>
              <p className="text-[13px] font-medium text-muted mb-2">Date</p>
              <div className="flex gap-2 items-center">
                <Chip active={form.day === today} onClick={() => set({ day: today })}>Today</Chip>
                <Chip active={form.day === yesterday} onClick={() => set({ day: yesterday })}>Yesterday</Chip>
                <input
                  type="date"
                  value={form.day || today}
                  max={today}
                  onChange={(e) => set({ day: e.target.value || today })}
                  aria-label="Pick a date"
                  className={cx('flex-1 min-w-0 h-9 px-3 rounded-full border text-sm bg-surface text-ink', form.day !== today && form.day !== yesterday ? 'border-accent' : 'border-line')}
                />
              </div>
            </div>

            <div>
              <p className="text-[13px] font-medium text-muted mb-2 flex items-center gap-1.5"><Repeat size={14} /> Repeat each cycle</p>
              <Segmented
                ariaLabel="Repeat"
                size="sm"
                value={form.recurring || 'none'}
                onChange={(recurring) => set({ recurring })}
                options={[{ value: 'none', label: 'Once' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]}
              />
            </div>

            <div>
              <p className="text-[13px] font-medium text-muted mb-2">Tags</p>
              <div className="flex flex-wrap gap-2">
                {state.tags.map((tag) => (
                  <Chip key={tag} active={form.tags?.includes(tag)} onClick={() => toggleTag(tag)}>#{tag}</Chip>
                ))}
                <div className="flex items-center h-9 rounded-full border border-dashed border-line-strong pl-3 pr-1">
                  <input
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                    placeholder="New tag"
                    aria-label="New tag"
                    className="w-20 bg-transparent outline-none text-sm placeholder:text-subtle"
                  />
                  <button type="button" onClick={addTag} aria-label="Add tag" className="w-7 h-7 rounded-full inline-flex items-center justify-center text-muted hover:text-ink"><Plus size={16} /></button>
                </div>
              </div>
            </div>
          </>
        )}

        {mode === 'transfer' && (
          <>
            <p className="text-sm text-muted -mt-1">Move money between budgets. Nothing is counted as spending.</p>
            <div>
              <p className="text-[13px] font-medium text-muted mb-2">From</p>
              <CategoryPicker categories={categories} value={transfer.fromId} onChange={(fromId) => { setTransfer((t) => ({ ...t, fromId, toId: t.toId === fromId ? '' : t.toId })); setError(''); }} />
            </div>
            <div className="flex justify-center text-subtle" aria-hidden="true"><ArrowDown size={20} /></div>
            <div>
              <p className="text-[13px] font-medium text-muted mb-2">To</p>
              <CategoryPicker categories={categories} exclude={transfer.fromId} value={transfer.toId} onChange={(toId) => { setTransfer((t) => ({ ...t, toId })); setError(''); }} />
            </div>
            <Field label="Amount">
              <MoneyInput symbol={money.symbol} value={transfer.amount} onChange={(e) => { setTransfer((t) => ({ ...t, amount: e.target.value })); setError(''); }} placeholder="0.00" />
            </Field>
          </>
        )}

        {mode === 'split' && (
          <>
            <Field label="What was it?">
              <TextInput value={splitLabel} onChange={(e) => setSplitLabel(e.target.value)} placeholder="e.g. Costco run" maxLength={60} />
            </Field>
            <div className="space-y-3">
              {lines.map((line, i) => (
                <div key={i} className="rounded-2xl border border-line p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-muted">Part {i + 1}</span>
                    {lines.length > 2 && (
                      <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label={`Remove part ${i + 1}`} className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted hover:text-danger"><X size={16} /></button>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-3 px-3" role="radiogroup" aria-label={`Budget for part ${i + 1}`}>
                    {categories.map((c) => {
                      const active = line.categoryId === c.id;
                      const tint = tintFor(c);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, categoryId: c.id } : l))); setError(''); }}
                          className={cx('h-9 px-3 rounded-full border text-sm font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0', active ? 'border-transparent' : 'border-line text-muted')}
                          style={active ? { background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint, boxShadow: `inset 0 0 0 1.5px ${tint}` } : undefined}
                        >
                          <CatIcon name={c.icon} size={15} /> {c.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-[120px_1fr] gap-2">
                    <MoneyInput symbol={money.symbol} value={line.amount} onChange={(e) => { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, amount: e.target.value } : l))); setError(''); }} placeholder="0.00" aria-label={`Amount for part ${i + 1}`} />
                    <TextInput value={line.description} onChange={(e) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)))} placeholder="Note (optional)" aria-label={`Note for part ${i + 1}`} />
                  </div>
                </div>
              ))}
            </div>
            <Button variant="secondary" className="w-full" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus size={18} /> Add part</Button>
          </>
        )}

        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}
