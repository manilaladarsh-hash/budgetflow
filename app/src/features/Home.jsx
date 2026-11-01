import { useMemo, useState } from 'react';
import { Minus, Plus, Flame, Trophy, ChevronRight, CalendarClock, Wallet, Pin, PinOff, Pencil } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { overview, billsWithStatus, upcomingSubscriptions } from '../lib/analytics.js';
import { isSpending } from '../lib/transactions.js';
import { sameMonth, formatShortDate } from '../lib/dates.js';
import { formatMoneyCompact } from '../lib/money.js';
import { Card, Button, SectionHeader, ProgressBar, Badge, EmptyState, Sheet, cx } from '../ui/primitives.jsx';
import { CategoryRow, TxRow, useMoney, useSortedCategories, StatTile, CategoryBadge } from './shared.jsx';
import CategoryEditor from './CategoryEditor.jsx';

const ACHIEVEMENTS = {
  '7day': '7-day streak',
  '30day': '30-day streak',
  no_overdraft: 'No overdraft'
};

export default function Home() {
  const { state, now } = useStore();
  const nav = useNav();
  const money = useMoney();
  const categories = useSortedCategories();
  const [detail, setDetail] = useState(null);
  const o = useMemo(() => overview({ ...state, now }), [state, now]);

  const recent = useMemo(() => state.transactions.filter((t) => t.type !== 'system').slice(0, 5), [state.transactions]);
  const dueBills = useMemo(() => billsWithStatus(state.bills, now).filter((b) => b.isOverdue || b.isDueSoon), [state.bills, now]);
  const dueSubs = useMemo(() => upcomingSubscriptions(state.subscriptions, now, 3), [state.subscriptions, now]);
  const paceTone = o.pace.status === 'over' ? 'danger' : o.pace.status === 'on' ? 'warn' : 'accent';
  const paceLabel = { under: 'Under pace', on: 'On pace', over: 'Over pace' }[o.pace.status];

  return (
    <div className="space-y-6 pt-2">
      {/* Hero */}
      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted">Left in your budgets</p>
            <p className={cx('text-[40px] leading-[1.1] font-semibold tracking-tight tabular mt-1', o.balance < 0 ? 'text-danger' : 'text-ink')}>
              {money(o.balance)}
            </p>
            <p className="text-sm text-muted mt-1.5">
              <span className="font-semibold text-accent-strong tabular">{money(o.safeToSpend)}</span> safe to spend
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <Badge tone={o.grade.tone} className="h-7 px-2.5 text-[13px]">Grade {o.grade.grade}</Badge>
            {state.streak.count > 0 && <Badge tone="warn"><Flame size={12} /> {state.streak.count}d</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 mt-5 no-print">
          <Button variant="danger-soft" onClick={() => nav.openAdd({ type: 'expense' })}><Minus size={18} /> Expense</Button>
          <Button variant="soft" onClick={() => nav.openAdd({ type: 'income' })}><Plus size={18} /> Income</Button>
        </div>
        <div className="mt-5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted">This week · <span className="tabular">{money(o.pace.spent)}</span> of <span className="tabular">{money(o.pace.budget)}</span></span>
            <span className={cx('font-semibold', paceTone === 'danger' ? 'text-danger' : paceTone === 'warn' ? 'text-warn' : 'text-accent-strong')}>{paceLabel}</span>
          </div>
          <ProgressBar value={o.pace.spent} max={o.pace.budget || 1} tone={paceTone} marker={o.pace.elapsed} className="mt-2" height={8} />
          <p className="text-xs text-subtle mt-2">The line marks where you'd be at an even pace.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <StatTile label="Per day" value={money(Math.round(o.pace.perDayLeft))} sub={`${o.pace.daysLeft}d left`} />
          <StatTile label="This month" value={money(Math.round(o.monthSpent))} sub="spent" tone={o.dailyAvg > o.targetDaily ? 'warn' : undefined} />
          <StatTile label="Month end" value={formatMoneyCompact(Math.abs(o.forecastMonthEnd), money.symbol)} sub={o.forecastMonthEnd < 0 ? 'over budget' : 'under budget'} tone={o.forecastMonthEnd < 0 ? 'bad' : 'good'} />
        </div>
      </Card>

      {/* Due soon */}
      {(dueBills.length > 0 || dueSubs.length > 0) && (
        <section>
          <SectionHeader title="Coming up" action={<button type="button" className="text-sm font-medium text-accent-strong h-9 px-2" onClick={() => nav.go('plan')}>Plan</button>} />
          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {dueBills.map((b) => (
              <button key={`b${b.id}`} type="button" onClick={() => nav.go('plan')} className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left hover:bg-surface-2">
                <span className={cx('w-10 h-10 rounded-2xl flex items-center justify-center', b.isOverdue ? 'bg-danger-soft text-danger' : 'bg-warn-soft text-warn')}><CalendarClock size={18} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{b.name}</span>
                  <span className="block text-[13px] text-muted">{b.isOverdue ? `Overdue by ${-b.daysUntilDue} day${b.daysUntilDue === -1 ? '' : 's'}` : b.daysUntilDue === 0 ? 'Due today' : `Due in ${b.daysUntilDue} day${b.daysUntilDue === 1 ? '' : 's'}`}</span>
                </span>
                <span className="font-semibold tabular">{money(b.amount)}</span>
              </button>
            ))}
            {dueSubs.map((s) => (
              <button key={`s${s.id}`} type="button" onClick={() => nav.go('plan')} className="w-full flex items-center gap-3 px-4 py-3 min-h-[56px] text-left hover:bg-surface-2">
                <span className="w-10 h-10 rounded-2xl bg-info-soft text-info flex items-center justify-center"><CalendarClock size={18} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-medium truncate">{s.name}</span>
                  <span className="block text-[13px] text-muted">Renews {formatShortDate(`${s.nextDue}T12:00:00`)}</span>
                </span>
                <span className="font-semibold tabular">{money(s.amount)}</span>
              </button>
            ))}
          </Card>
        </section>
      )}

      {/* Budgets */}
      <section>
        <SectionHeader title="Budgets" action={<button type="button" className="text-sm font-medium text-accent-strong h-9 px-2" onClick={() => nav.go('settings')}>Manage</button>} />
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {categories.length === 0 ? (
            <EmptyState icon={<Wallet size={22} />} title="No budgets yet" body="Create a budget to start tracking." action={<Button size="sm" onClick={() => nav.go('settings')}>Add a budget</Button>} />
          ) : categories.map((c) => (
            <CategoryRow
              key={c.id}
              category={c}
              onOpen={() => setDetail(c.id)}
              onQuickSpend={() => nav.openAdd({ type: 'expense', categoryId: c.id })}
            />
          ))}
        </Card>
      </section>

      {/* Recent */}
      <section>
        <SectionHeader title="Recent" action={<button type="button" className="text-sm font-medium text-accent-strong h-9 px-2 inline-flex items-center gap-0.5" onClick={() => nav.go('activity')}>See all <ChevronRight size={16} /></button>} />
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {recent.length === 0 ? (
            <EmptyState title="Nothing logged yet" body="Tap + to add your first expense or income." />
          ) : recent.map((t) => <TxRow key={t.id} tx={t} onClick={() => nav.openTransaction(t)} showDate />)}
        </Card>
      </section>

      {state.achievements.length > 0 && (
        <section className="flex flex-wrap gap-2 px-1">
          {state.achievements.map((a) => ACHIEVEMENTS[a] && <Badge key={a} tone="warn"><Trophy size={12} /> {ACHIEVEMENTS[a]}</Badge>)}
        </section>
      )}

      <CategoryDetail id={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function CategoryDetail({ id, onClose }) {
  const { state, actions, now } = useStore();
  const nav = useNav();
  const money = useMoney();
  const [editing, setEditing] = useState(false);
  const category = state.categories.find((c) => c.id === id);
  const txs = useMemo(() => (id ? state.transactions.filter((t) => t.categoryId === id) : []), [state.transactions, id]);
  if (!category) return null;
  const monthSpent = txs.filter((t) => isSpending(t) && sameMonth(t.date, now)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const start = (action) => { onClose(); setTimeout(action, 50); };
  return (
    <>
      <Sheet open={!!id && !editing} onClose={onClose} title={category.name}>
        <div className="flex items-center gap-3 mb-4">
          <CategoryBadge category={category} size={48} iconSize={24} />
          <div>
            <p className={cx('text-2xl font-semibold tabular', category.balance < 0 ? 'text-danger' : 'text-ink')}>{money(category.balance)}</p>
            <p className="text-sm text-muted">left of {money(category.limit)} · {category.frequency}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatTile label="Spent this month" value={money(Math.round(monthSpent))} />
          <StatTile label="Last rollover" value={category.lastRollover !== undefined && category.lastRollover !== null ? money(category.lastRollover, { signed: true }) : '—'} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="danger-soft" onClick={() => start(() => nav.openAdd({ type: 'expense', categoryId: id }))}><Minus size={18} /> Expense</Button>
          <Button variant="soft" onClick={() => start(() => nav.openAdd({ type: 'income', categoryId: id }))}><Plus size={18} /> Income</Button>
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</Button>
          <Button variant="secondary" onClick={() => actions.togglePin(id)}>{category.pinned ? <><PinOff size={16} /> Unpin</> : <><Pin size={16} /> Pin to top</>}</Button>
        </div>
        <p className="text-[13px] font-semibold uppercase tracking-wide text-subtle mt-6 mb-1">Recent in {category.name}</p>
        <div className="-mx-5 divide-y divide-[var(--border)]">
          {txs.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No entries yet.</p>
            : txs.slice(0, 8).map((t) => <TxRow key={t.id} tx={t} showDate onClick={() => start(() => nav.openTransaction(t))} />)}
        </div>
      </Sheet>
      <CategoryEditor open={editing} category={category} onClose={() => setEditing(false)} onDeleted={() => { setEditing(false); onClose(); }} />
    </>
  );
}
