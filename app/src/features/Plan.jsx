import { useEffect, useMemo, useState } from 'react';
import { Plus, Target, CalendarClock, Repeat, Landmark, Star, Check, ExternalLink, Pencil, Trash2, Undo2, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useFeedback } from '../ui/feedback.jsx';
import { parseAmount, roundMoney } from '../lib/money.js';
import { localDayKey, formatShortDate } from '../lib/dates.js';
import { billsWithStatus, totalMonthlySubscriptions, subscriptionMonthly, goalPlan, overview } from '../lib/analytics.js';
import { Card, Button, Sheet, Field, TextInput, MoneyInput, Segmented, Toggle, Badge, EmptyState, ProgressBar, IconButton, cx } from '../ui/primitives.jsx';
import { CatIcon, GOAL_ICON_CHOICES, PALETTE, PALETTE_CHOICES } from '../ui/icons.jsx';
import { CategoryPicker, useMoney, useSortedCategories } from './shared.jsx';

const SECTIONS = [
  { id: 'goals', label: 'Goals', Icon: Target },
  { id: 'bills', label: 'Bills', Icon: CalendarClock },
  { id: 'subs', label: 'Subscriptions', Icon: Repeat },
  { id: 'worth', label: 'Net worth', Icon: Landmark },
  { id: 'wish', label: 'Wishlist', Icon: Star }
];

const goalColor = (g) => PALETTE[g.color] || (typeof g.color === 'string' && g.color.startsWith('#') ? g.color : PALETTE.emerald);

export default function Plan() {
  const [section, setSection] = useState(() => {
    try { return sessionStorage.getItem('plan_section') || 'goals'; } catch { return 'goals'; }
  });
  useEffect(() => { try { sessionStorage.setItem('plan_section', section); } catch { /* ignore */ } }, [section]);
  return (
    <div className="space-y-5 pt-2">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="tablist" aria-label="Plan sections">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            onClick={() => setSection(s.id)}
            className={cx('h-10 px-4 rounded-full inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap border transition',
              section === s.id ? 'bg-ink text-bg border-transparent' : 'bg-surface border-line text-muted hover:text-ink')}
          >
            <s.Icon size={16} /> {s.label}
          </button>
        ))}
      </div>
      {section === 'goals' && <Goals />}
      {section === 'bills' && <Bills />}
      {section === 'subs' && <Subscriptions />}
      {section === 'worth' && <NetWorth />}
      {section === 'wish' && <Wishlist />}
    </div>
  );
}

function SummaryCard({ label, value, sub, action }) {
  return (
    <Card className="p-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-3xl font-semibold tabular mt-1 truncate">{value}</p>
        {sub && <p className="text-sm text-muted mt-1">{sub}</p>}
      </div>
      {action}
    </Card>
  );
}

const AddButton = ({ onClick, label }) => <Button size="sm" onClick={onClick}><Plus size={16} /> {label}</Button>;

// ---------------- Goals ----------------
function Goals() {
  const { state, actions, now } = useStore();
  const { notify, ask, celebrate } = useFeedback();
  const money = useMoney();
  const [editing, setEditing] = useState(null);
  const [moving, setMoving] = useState(null);
  const saved = state.goals.reduce((s, g) => s + g.saved, 0);
  const target = state.goals.reduce((s, g) => s + g.target, 0);

  return (
    <>
      <SummaryCard label="Saved toward goals" value={money(Math.round(saved))} sub={target ? `of ${money(Math.round(target))}` : 'Set a goal to start saving'} action={<AddButton label="Goal" onClick={() => setEditing({})} />} />
      {state.goals.length === 0 ? (
        <Card><EmptyState icon={<Target size={22} />} title="No goals yet" body="Saving for a trip, a laptop or a rainy-day fund? Add a goal and log deposits as you go." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {state.goals.map((g) => {
            const color = goalColor(g);
            const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
            const plan = goalPlan(g, now);
            const done = g.saved >= g.target && g.target > 0;
            return (
              <Card key={g.id} className="p-4">
                <div className="flex items-start gap-3">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}><CatIcon name={g.icon} size={20} /></span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{g.name}</p>
                    <p className="text-sm text-muted tabular">{money(g.saved)} of {money(g.target)}</p>
                  </div>
                  <IconButton label={`Edit ${g.name}`} size={36} onClick={() => setEditing(g)}><Pencil size={16} /></IconButton>
                </div>
                <ProgressBar value={pct} max={100} tone={color} className="mt-3" height={8} />
                <div className="flex items-center justify-between mt-2 text-xs text-muted">
                  <span>{done ? 'Goal reached 🎉' : `${Math.round(pct)}%`}</span>
                  {!done && plan.perWeek !== null && <span className="tabular">{money(Math.ceil(plan.perWeek))}/week to hit {formatShortDate(`${g.deadline}T12:00:00`)}</span>}
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Button size="sm" variant="secondary" onClick={() => setMoving({ goal: g, dir: 'out' })} disabled={g.saved <= 0}><ArrowUpFromLine size={15} /> Withdraw</Button>
                  <Button size="sm" variant="soft" onClick={() => setMoving({ goal: g, dir: 'in' })}><ArrowDownToLine size={15} /> Deposit</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <GoalEditor
        goal={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => {
          if (editing?.id) { actions.goals.update(editing.id, data); notify('Goal updated'); } else { actions.goals.add({ ...data, saved: 0, deposits: [] }); notify(`Goal “${data.name}” created`); }
          setEditing(null);
        }}
        onDelete={async () => {
          const ok = await ask({ title: `Delete ${editing.name}?`, message: 'The goal and its deposit history are removed. Your budgets are not changed.', confirmLabel: 'Delete', destructive: true });
          if (!ok) return;
          actions.goals.remove(editing.id);
          setEditing(null);
          notify('Goal deleted');
        }}
      />
      <AmountSheet
        open={!!moving}
        title={moving?.dir === 'in' ? `Deposit to ${moving?.goal.name}` : `Withdraw from ${moving?.goal.name}`}
        cta={moving?.dir === 'in' ? 'Deposit' : 'Withdraw'}
        max={moving?.dir === 'out' ? moving?.goal.saved : undefined}
        onClose={() => setMoving(null)}
        onSubmit={(amount) => {
          if (moving.dir === 'in') {
            const reached = actions.goals.deposit(moving.goal.id, amount);
            if (reached) { celebrate(); notify(`You reached “${moving.goal.name}”!`); } else notify(`${money(amount)} saved`);
          } else {
            actions.goals.withdraw(moving.goal.id, amount);
            notify(`${money(amount)} withdrawn`);
          }
          setMoving(null);
        }}
      />
    </>
  );
}

function GoalEditor({ goal, onClose, onSave, onDelete }) {
  const money = useMoney();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!goal) return;
    setError('');
    setForm({ name: goal.name || '', target: goal.target ? String(goal.target) : '', icon: goal.icon || 'target', color: PALETTE[goal.color] ? goal.color : 'emerald', deadline: goal.deadline || '' });
  }, [goal]);
  const set = (p) => { setForm((f) => ({ ...f, ...p })); setError(''); };
  const save = (e) => {
    e?.preventDefault();
    const target = parseAmount(form.target);
    if (!form.name.trim()) return setError('Name your goal.');
    if (!(target > 0)) return setError('Enter a target amount.');
    onSave({ name: form.name.trim(), target: roundMoney(target), icon: form.icon, color: form.color, deadline: form.deadline || null });
    return undefined;
  };
  const color = PALETTE[form.color] || PALETTE.emerald;
  return (
    <Sheet open={!!goal} onClose={onClose} title={goal?.id ? 'Edit goal' : 'New goal'}
      footer={<div className="flex gap-3">{goal?.id && <Button variant="danger-soft" onClick={onDelete} aria-label="Delete goal"><Trash2 size={18} /></Button>}<Button className="flex-1" onClick={save}>{goal?.id ? 'Save' : 'Create goal'}</Button></div>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><TextInput value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Japan trip" data-autofocus maxLength={40} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target"><MoneyInput symbol={money.symbol} value={form.target || ''} onChange={(e) => set({ target: e.target.value })} placeholder="0" /></Field>
          <Field label="By (optional)"><TextInput type="date" value={form.deadline || ''} min={localDayKey()} onChange={(e) => set({ deadline: e.target.value })} /></Field>
        </div>
        <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Colour">
          {PALETTE_CHOICES.map((k) => (
            <button key={k} type="button" role="radio" aria-checked={form.color === k} aria-label={k} onClick={() => set({ color: k })} className="w-9 h-9 rounded-full"
              style={{ background: PALETTE[k], boxShadow: form.color === k ? `0 0 0 3px var(--surface), 0 0 0 5px ${PALETTE[k]}` : 'none' }} />
          ))}
        </div>
        <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Icon">
          {GOAL_ICON_CHOICES.map((n) => (
            <button key={n} type="button" role="radio" aria-checked={form.icon === n} aria-label={n} onClick={() => set({ icon: n })}
              className={cx('h-11 rounded-2xl flex items-center justify-center border', form.icon === n ? 'border-transparent' : 'border-line text-muted')}
              style={form.icon === n ? { background: `color-mix(in srgb, ${color} 16%, transparent)`, color, boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}>
              <CatIcon name={n} size={20} />
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}

function AmountSheet({ open, title, cta, onClose, onSubmit, max }) {
  const money = useMoney();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setValue(''); setError(''); } }, [open]);
  const submit = (e) => {
    e?.preventDefault();
    const n = parseAmount(value);
    if (!(n > 0)) return setError('Enter an amount above zero.');
    if (max !== undefined && n > max) return setError(`You can withdraw up to ${money(max)}.`);
    onSubmit(roundMoney(n));
    return undefined;
  };
  return (
    <Sheet open={open} onClose={onClose} title={title} size="sm" footer={<Button className="w-full" onClick={submit}>{cta}</Button>}>
      <form onSubmit={submit}>
        <MoneyInput symbol={money.symbol} value={value} onChange={(e) => { setValue(e.target.value); setError(''); }} placeholder="0.00" aria-label="Amount" data-autofocus inputClassName="h-14 text-2xl font-semibold" />
        {error && <p className="text-sm text-danger mt-2" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}

// ---------------- Bills ----------------
function Bills() {
  const { state, actions, now } = useStore();
  const { notify, ask } = useFeedback();
  const money = useMoney();
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const list = useMemo(() => billsWithStatus(state.bills, now), [state.bills, now]);
  const unpaid = list.filter((b) => !b.isPaid).reduce((s, b) => s + b.amount, 0);
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });

  const status = (b) => {
    if (b.isPaid) return <Badge tone="good"><Check size={12} /> Paid</Badge>;
    if (b.isOverdue) return <Badge tone="bad">Overdue {-b.daysUntilDue}d</Badge>;
    if (b.daysUntilDue === 0) return <Badge tone="warn">Due today</Badge>;
    if (b.isDueSoon) return <Badge tone="warn">In {b.daysUntilDue}d</Badge>;
    return <Badge>{formatShortDate(b.dueDate)}</Badge>;
  };

  return (
    <>
      <SummaryCard label={`Unpaid in ${monthName}`} value={money(Math.round(unpaid))} sub={`${list.filter((b) => b.isPaid).length} of ${list.length} paid`} action={<AddButton label="Bill" onClick={() => setEditing({})} />} />
      {list.length === 0 ? (
        <Card><EmptyState icon={<CalendarClock size={22} />} title="No bills yet" body="Add rent, utilities or loans with their due day and BudgetFlow will remind you each month." /></Card>
      ) : (
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {list.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3 min-h-[64px]">
              <button type="button" onClick={() => setEditing(b)} className="flex-1 min-w-0 text-left">
                <span className={cx('block text-[15px] font-medium truncate', b.isPaid && 'text-muted line-through decoration-1')}>{b.name}</span>
                <span className="flex items-center gap-2 mt-1">{status(b)}<span className="text-[13px] text-muted tabular">{money(b.amount)}</span></span>
              </button>
              {b.isPaid ? (
                <IconButton label={`Mark ${b.name} unpaid`} onClick={() => actions.bills.markUnpaid(b.id)}><Undo2 size={18} /></IconButton>
              ) : (
                <Button size="sm" variant="soft" onClick={() => setPaying(b)}>Paid</Button>
              )}
            </div>
          ))}
        </Card>
      )}
      <PaySheet
        item={paying}
        onClose={() => setPaying(null)}
        onConfirm={(log) => { actions.bills.markPaid(paying.id, { log }); notify(log ? `${paying.name} paid and logged` : `${paying.name} marked paid`); setPaying(null); }}
      />
      <BillEditor
        bill={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => { if (editing?.id) actions.bills.update(editing.id, data); else actions.bills.add({ ...data, paid: false, lastPaidMonth: null }); notify(editing?.id ? 'Bill updated' : 'Bill added'); setEditing(null); }}
        onDelete={async () => {
          const ok = await ask({ title: `Delete ${editing.name}?`, message: 'This removes the bill reminder.', confirmLabel: 'Delete', destructive: true });
          if (!ok) return;
          actions.bills.remove(editing.id);
          setEditing(null);
          notify('Bill deleted');
        }}
      />
    </>
  );
}

function PaySheet({ item, onClose, onConfirm }) {
  const { state } = useStore();
  const money = useMoney();
  const category = state.categories.find((c) => c.id === item?.categoryId);
  const [log, setLog] = useState(true);
  useEffect(() => { if (item) setLog(!!category); }, [item, category]);
  if (!item) return null;
  return (
    <Sheet open onClose={onClose} title={`Mark ${item.name} paid`} size="sm" footer={<Button className="w-full" onClick={() => onConfirm(log && !!category)}>Mark paid</Button>}>
      <p className="text-[15px] text-muted">{money(item.amount)}{category ? ` · ${category.name}` : ''}</p>
      <div className="mt-4">
        {category ? (
          <Toggle checked={log} onChange={setLog} label={`Also log as an expense`} description={`Subtracts ${money(item.amount)} from ${category.name}.`} />
        ) : (
          <p className="text-sm text-subtle">Link this to a budget (edit it) to log payments automatically.</p>
        )}
      </div>
    </Sheet>
  );
}

function BillEditor({ bill, onClose, onSave, onDelete }) {
  const money = useMoney();
  const categories = useSortedCategories();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!bill) return;
    setError('');
    setForm({ name: bill.name || '', amount: bill.amount ? String(bill.amount) : '', dueDay: bill.dueDay ? String(bill.dueDay) : '', categoryId: bill.categoryId || '' });
  }, [bill]);
  const set = (p) => { setForm((f) => ({ ...f, ...p })); setError(''); };
  const save = (e) => {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    const dueDay = parseInt(form.dueDay, 10);
    if (!form.name.trim()) return setError('Name the bill.');
    if (!(amount > 0)) return setError('Enter the amount.');
    if (!(dueDay >= 1 && dueDay <= 31)) return setError('Due day must be 1–31.');
    onSave({ name: form.name.trim(), amount: roundMoney(amount), dueDay, categoryId: form.categoryId || '', icon: 'file-text' });
    return undefined;
  };
  return (
    <Sheet open={!!bill} onClose={onClose} title={bill?.id ? 'Edit bill' : 'New bill'}
      footer={<div className="flex gap-3">{bill?.id && <Button variant="danger-soft" onClick={onDelete} aria-label="Delete bill"><Trash2 size={18} /></Button>}<Button className="flex-1" onClick={save}>{bill?.id ? 'Save' : 'Add bill'}</Button></div>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><TextInput value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Hydro" data-autofocus maxLength={40} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount"><MoneyInput symbol={money.symbol} value={form.amount || ''} onChange={(e) => set({ amount: e.target.value })} placeholder="0" /></Field>
          <Field label="Due day of month"><TextInput inputMode="numeric" value={form.dueDay || ''} onChange={(e) => set({ dueDay: e.target.value.replace(/\D/g, '').slice(0, 2) })} placeholder="1–31" /></Field>
        </div>
        <div>
          <p className="text-[13px] font-medium text-muted mb-2">Paid from budget (optional)</p>
          <CategoryPicker categories={categories} value={form.categoryId} onChange={(categoryId) => set({ categoryId: categoryId === form.categoryId ? '' : categoryId })} showBalance={false} />
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}

// ---------------- Subscriptions ----------------
function Subscriptions() {
  const { state, actions } = useStore();
  const { notify, ask } = useFeedback();
  const money = useMoney();
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const monthly = totalMonthlySubscriptions(state.subscriptions);
  const list = [...state.subscriptions].sort((a, b) => (b.active - a.active) || String(a.nextDue).localeCompare(String(b.nextDue)));
  const freqLabel = { weekly: '/wk', monthly: '/mo', yearly: '/yr' };

  return (
    <>
      <SummaryCard label="Subscriptions per month" value={money(Math.round(monthly))} sub={`${money(Math.round(monthly * 12))} a year`} action={<AddButton label="Subscription" onClick={() => setEditing({})} />} />
      {list.length === 0 ? (
        <Card><EmptyState icon={<Repeat size={22} />} title="No subscriptions" body="Track streaming, apps and memberships so renewals never surprise you." /></Card>
      ) : (
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {list.map((s) => (
            <div key={s.id} className={cx('flex items-center gap-3 px-4 py-3 min-h-[64px]', !s.active && 'opacity-55')}>
              <button type="button" onClick={() => setEditing(s)} className="flex-1 min-w-0 text-left">
                <span className="block text-[15px] font-medium truncate">{s.name}</span>
                <span className="block text-[13px] text-muted tabular mt-0.5">
                  {money(s.amount)}{freqLabel[s.frequency] || ''} · {s.active ? (s.nextDue ? `renews ${formatShortDate(`${s.nextDue}T12:00:00`)}` : 'no date') : 'paused'}
                  {s.frequency !== 'monthly' && s.active ? ` · ≈${money(Math.round(subscriptionMonthly(s)))}/mo` : ''}
                </span>
              </button>
              {s.active ? (
                <Button size="sm" variant="soft" onClick={() => setPaying(s)}>Paid</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => actions.subscriptions.toggle(s.id)}>Resume</Button>
              )}
            </div>
          ))}
        </Card>
      )}
      <PaySheet
        item={paying}
        onClose={() => setPaying(null)}
        onConfirm={(log) => { actions.subscriptions.markPaid(paying.id, { log }); notify(`${paying.name} paid — next renewal moved forward`); setPaying(null); }}
      />
      <SubEditor
        sub={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => { if (editing?.id) actions.subscriptions.update(editing.id, data); else actions.subscriptions.add({ ...data, active: true }); notify(editing?.id ? 'Subscription updated' : 'Subscription added'); setEditing(null); }}
        onToggle={() => { actions.subscriptions.toggle(editing.id); setEditing(null); }}
        onDelete={async () => {
          const ok = await ask({ title: `Delete ${editing.name}?`, message: 'This removes the subscription.', confirmLabel: 'Delete', destructive: true });
          if (!ok) return;
          actions.subscriptions.remove(editing.id);
          setEditing(null);
          notify('Subscription deleted');
        }}
      />
    </>
  );
}

function SubEditor({ sub, onClose, onSave, onDelete, onToggle }) {
  const money = useMoney();
  const categories = useSortedCategories();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!sub) return;
    setError('');
    setForm({ name: sub.name || '', amount: sub.amount ? String(sub.amount) : '', frequency: sub.frequency || 'monthly', nextDue: sub.nextDue || localDayKey(), categoryId: sub.categoryId || '' });
  }, [sub]);
  const set = (p) => { setForm((f) => ({ ...f, ...p })); setError(''); };
  const save = (e) => {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.name.trim()) return setError('Name the subscription.');
    if (!(amount > 0)) return setError('Enter the price.');
    onSave({ name: form.name.trim(), amount: roundMoney(amount), frequency: form.frequency, nextDue: form.nextDue || localDayKey(), categoryId: form.categoryId || '', icon: 'credit-card' });
    return undefined;
  };
  return (
    <Sheet open={!!sub} onClose={onClose} title={sub?.id ? 'Edit subscription' : 'New subscription'}
      footer={(
        <div className="flex gap-3">
          {sub?.id && <Button variant="danger-soft" onClick={onDelete} aria-label="Delete subscription"><Trash2 size={18} /></Button>}
          {sub?.id && <Button variant="secondary" onClick={onToggle}>{sub.active ? 'Pause' : 'Resume'}</Button>}
          <Button className="flex-1" onClick={save}>{sub?.id ? 'Save' : 'Add'}</Button>
        </div>
      )}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Name"><TextInput value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Netflix" data-autofocus maxLength={40} /></Field>
        <Segmented ariaLabel="Billing" value={form.frequency} onChange={(frequency) => set({ frequency })} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Price"><MoneyInput symbol={money.symbol} value={form.amount || ''} onChange={(e) => set({ amount: e.target.value })} placeholder="0" /></Field>
          <Field label="Next renewal"><TextInput type="date" value={form.nextDue || ''} onChange={(e) => set({ nextDue: e.target.value })} /></Field>
        </div>
        <div>
          <p className="text-[13px] font-medium text-muted mb-2">Paid from budget (optional)</p>
          <CategoryPicker categories={categories} value={form.categoryId} onChange={(categoryId) => set({ categoryId: categoryId === form.categoryId ? '' : categoryId })} showBalance={false} />
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}

// ---------------- Net worth ----------------
function NetWorth() {
  const { state, actions } = useStore();
  const { notify, ask } = useFeedback();
  const money = useMoney();
  const [editing, setEditing] = useState(null);
  const assets = state.netWorth.filter((i) => i.type === 'asset');
  const debts = state.netWorth.filter((i) => i.type === 'liability');
  const totalA = assets.reduce((s, i) => s + i.amount, 0);
  const totalL = debts.reduce((s, i) => s + i.amount, 0);

  const group = (title, items, total, tone) => items.length > 0 && (
    <section>
      <div className="flex justify-between px-1 mb-2 text-[13px] font-semibold uppercase tracking-wide text-subtle"><span>{title}</span><span className={cx('tabular', tone)}>{money(Math.round(total))}</span></div>
      <Card className="divide-y divide-[var(--border)] overflow-hidden">
        {items.map((i) => (
          <button key={i.id} type="button" onClick={() => setEditing(i)} className="w-full flex items-center justify-between gap-3 px-4 py-3 min-h-[56px] text-left hover:bg-surface-2">
            <span className="text-[15px] font-medium truncate">{i.name}</span>
            <span className="text-[15px] font-semibold tabular">{money(i.amount)}</span>
          </button>
        ))}
      </Card>
    </section>
  );

  return (
    <>
      <SummaryCard
        label="Net worth"
        value={money(Math.round(totalA - totalL))}
        sub={state.netWorth.length ? `${money(Math.round(totalA))} assets · ${money(Math.round(totalL))} debts` : 'Add accounts, savings and debts'}
        action={<AddButton label="Item" onClick={() => setEditing({ type: 'asset' })} />}
      />
      {state.netWorth.length === 0 ? (
        <Card><EmptyState icon={<Landmark size={22} />} title="Nothing tracked yet" body="Add bank accounts, investments and loans to see your net worth in one number." /></Card>
      ) : (
        <>
          {group('Assets', assets, totalA, 'text-accent-strong')}
          {group('Debts', debts, totalL, 'text-danger')}
        </>
      )}
      <NetWorthEditor
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => { if (editing?.id) actions.netWorth.update(editing.id, data); else actions.netWorth.add({ ...data, icon: 'landmark' }); notify(editing?.id ? 'Updated' : 'Added'); setEditing(null); }}
        onDelete={async () => {
          const ok = await ask({ title: `Delete ${editing.name}?`, confirmLabel: 'Delete', destructive: true });
          if (!ok) return;
          actions.netWorth.remove(editing.id);
          setEditing(null);
        }}
      />
    </>
  );
}

function NetWorthEditor({ item, onClose, onSave, onDelete }) {
  const money = useMoney();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setError('');
    setForm({ name: item.name || '', amount: item.amount !== undefined ? String(item.amount) : '', type: item.type || 'asset' });
  }, [item]);
  const set = (p) => { setForm((f) => ({ ...f, ...p })); setError(''); };
  const save = (e) => {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    if (!form.name.trim()) return setError('Add a name.');
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter the current value.');
    onSave({ name: form.name.trim(), amount: roundMoney(amount), type: form.type });
    return undefined;
  };
  return (
    <Sheet open={!!item} onClose={onClose} title={item?.id ? 'Edit item' : 'New item'}
      footer={<div className="flex gap-3">{item?.id && <Button variant="danger-soft" onClick={onDelete} aria-label="Delete item"><Trash2 size={18} /></Button>}<Button className="flex-1" onClick={save}>Save</Button></div>}>
      <form onSubmit={save} className="space-y-4">
        <Segmented ariaLabel="Kind" value={form.type} onChange={(type) => set({ type })} options={[{ value: 'asset', label: 'Asset' }, { value: 'liability', label: 'Debt' }]} />
        <Field label="Name"><TextInput value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder={form.type === 'asset' ? 'e.g. Savings account' : 'e.g. Student loan'} data-autofocus maxLength={40} /></Field>
        <Field label="Current value"><MoneyInput symbol={money.symbol} value={form.amount || ''} onChange={(e) => set({ amount: e.target.value })} placeholder="0" /></Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}

// ---------------- Wishlist ----------------
const PRIORITY = { high: { label: 'High', tone: 'bad' }, medium: { label: 'Medium', tone: 'warn' }, low: { label: 'Low', tone: 'neutral' } };

function Wishlist() {
  const { state, actions, now } = useStore();
  const { notify, ask } = useFeedback();
  const money = useMoney();
  const [editing, setEditing] = useState(null);
  const safe = useMemo(() => overview({ ...state, now }).safeToSpend, [state, now]);
  const order = { high: 0, medium: 1, low: 2 };
  const list = [...state.wishlist].sort((a, b) => (a.purchased - b.purchased) || (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  const open = list.filter((w) => !w.purchased).reduce((s, w) => s + w.price, 0);

  return (
    <>
      <SummaryCard label="Wishlist total" value={money(Math.round(open))} sub={`${money(Math.round(safe))} safe to spend right now`} action={<AddButton label="Wish" onClick={() => setEditing({})} />} />
      {list.length === 0 ? (
        <Card><EmptyState icon={<Star size={22} />} title="Wishlist is empty" body="Park things you want here and buy them when your budget says it's safe." /></Card>
      ) : (
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {list.map((w) => {
            const affordable = w.price <= safe;
            return (
              <div key={w.id} className={cx('flex items-center gap-3 px-4 py-3 min-h-[64px]', w.purchased && 'opacity-55')}>
                <button type="button" onClick={() => actions.wishlist.togglePurchased(w.id)} aria-label={w.purchased ? `Mark ${w.name} not bought` : `Mark ${w.name} bought`}
                  className={cx('w-7 h-7 rounded-full border-2 inline-flex items-center justify-center shrink-0', w.purchased ? 'bg-accent border-accent text-accent-fg' : 'border-line-strong')}>
                  {w.purchased && <Check size={15} strokeWidth={3} />}
                </button>
                <button type="button" onClick={() => setEditing(w)} className="flex-1 min-w-0 text-left">
                  <span className={cx('block text-[15px] font-medium truncate', w.purchased && 'line-through decoration-1')}>{w.name}</span>
                  <span className="flex items-center gap-2 mt-1">
                    <Badge tone={PRIORITY[w.priority]?.tone || 'neutral'}>{PRIORITY[w.priority]?.label || 'Medium'}</Badge>
                    {!w.purchased && <span className={cx('text-xs', affordable ? 'text-accent-strong' : 'text-subtle')}>{affordable ? 'Affordable now' : 'Not yet'}</span>}
                  </span>
                </button>
                {w.url && /^https?:\/\//i.test(w.url) && (
                  <a href={w.url} target="_blank" rel="noopener noreferrer" aria-label={`Open link for ${w.name}`} className="w-10 h-10 rounded-full inline-flex items-center justify-center text-muted hover:text-ink"><ExternalLink size={17} /></a>
                )}
                <span className="text-[15px] font-semibold tabular">{money(w.price)}</span>
              </div>
            );
          })}
        </Card>
      )}
      <WishEditor
        item={editing}
        onClose={() => setEditing(null)}
        onSave={(data) => { if (editing?.id) actions.wishlist.update(editing.id, data); else actions.wishlist.add({ ...data, purchased: false }); notify(editing?.id ? 'Updated' : `“${data.name}” added`); setEditing(null); }}
        onDelete={async () => {
          const ok = await ask({ title: `Delete ${editing.name}?`, confirmLabel: 'Delete', destructive: true });
          if (!ok) return;
          actions.wishlist.remove(editing.id);
          setEditing(null);
        }}
      />
    </>
  );
}

function WishEditor({ item, onClose, onSave, onDelete }) {
  const money = useMoney();
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    if (!item) return;
    setError('');
    setForm({ name: item.name || '', price: item.price !== undefined ? String(item.price) : '', priority: item.priority || 'medium', url: item.url || '' });
  }, [item]);
  const set = (p) => { setForm((f) => ({ ...f, ...p })); setError(''); };
  const save = (e) => {
    e?.preventDefault();
    const price = parseAmount(form.price);
    if (!form.name.trim()) return setError('What do you want?');
    if (!Number.isFinite(price) || price < 0) return setError('Enter a price.');
    const url = form.url.trim();
    onSave({ name: form.name.trim(), price: roundMoney(price), priority: form.priority, url: url && !/^https?:\/\//i.test(url) ? `https://${url}` : url });
    return undefined;
  };
  return (
    <Sheet open={!!item} onClose={onClose} title={item?.id ? 'Edit wish' : 'New wish'}
      footer={<div className="flex gap-3">{item?.id && <Button variant="danger-soft" onClick={onDelete} aria-label="Delete wish"><Trash2 size={18} /></Button>}<Button className="flex-1" onClick={save}>Save</Button></div>}>
      <form onSubmit={save} className="space-y-4">
        <Field label="Item"><TextInput value={form.name || ''} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Running shoes" data-autofocus maxLength={60} /></Field>
        <Field label="Price"><MoneyInput symbol={money.symbol} value={form.price || ''} onChange={(e) => set({ price: e.target.value })} placeholder="0" /></Field>
        <Segmented ariaLabel="Priority" value={form.priority} onChange={(priority) => set({ priority })} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
        <Field label="Link (optional)"><TextInput type="url" inputMode="url" value={form.url || ''} onChange={(e) => set({ url: e.target.value })} placeholder="https://" /></Field>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}
