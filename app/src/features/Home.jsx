import { useMemo, useState } from 'react';
import {
  Minus, Plus, Flame, Trophy, ChevronRight, CalendarClock, Wallet, Pin, PinOff, Pencil, ArrowLeftRight, Upload, ArrowDownLeft, ArrowUpRight, Repeat
} from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { overview, billsWithStatus, upcomingSubscriptions, cashFlow } from '../lib/analytics.js';
import { isSpending } from '../lib/transactions.js';
import { sameMonth, formatShortDate } from '../lib/dates.js';
import { formatMoneyCompact } from '../lib/money.js';
import { Card, Button, SectionHeader, Badge, EmptyState, Sheet, Ring, cx } from '../ui/primitives.jsx';
import { CatIcon, tintFor } from '../ui/icons.jsx';
import { TxRow, useMoney, useSortedCategories, StatTile } from './shared.jsx';
import CategoryEditor from './CategoryEditor.jsx';

const ACHIEVEMENTS = {
  '7day': '7-day streak',
  '30day': '30-day streak',
  no_overdraft: 'No overdraft'
};

const LinkButton = ({ onClick, children }) => (
  <button type="button" className="text-sm font-semibold text-brand h-9 px-2 -mr-2 inline-flex items-center gap-0.5" onClick={onClick}>
    {children} <ChevronRight size={16} />
  </button>
);

export default function Home() {
  const { state, now } = useStore();
  const nav = useNav();
  const categories = useSortedCategories();
  const [detail, setDetail] = useState(null);
  const o = useMemo(() => overview({ ...state, now }), [state, now]);
  const flow = useMemo(() => cashFlow(state.transactions, now), [state.transactions, now]);

  const recent = useMemo(() => state.transactions.filter((t) => t.type !== 'system').slice(0, 5), [state.transactions]);
  const dueBills = useMemo(() => billsWithStatus(state.bills, now).filter((b) => b.isOverdue || b.isDueSoon), [state.bills, now]);
  const dueSubs = useMemo(() => upcomingSubscriptions(state.subscriptions, now, 7), [state.subscriptions, now]);

  return (
    <div className="space-y-7 pt-1 stagger">
      <Hero o={o} streak={state.streak.count} />

      <QuickActions />

      <MonthStrip flow={flow} now={now} onOpen={() => nav.go('insights')} />

      {(dueBills.length > 0 || dueSubs.length > 0) && (
        <section>
          <SectionHeader title="Coming up" action={<LinkButton onClick={() => nav.go('plan')}>Plan</LinkButton>} />
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 snap-x">
            {dueBills.map((b) => (
              <DueCard
                key={`b${b.id}`}
                onClick={() => nav.go('plan')}
                tone={b.isOverdue ? 'danger' : 'warn'}
                icon={<CalendarClock size={18} />}
                name={b.name}
                when={b.isOverdue ? `Overdue ${-b.daysUntilDue}d` : b.daysUntilDue === 0 ? 'Due today' : `Due in ${b.daysUntilDue}d`}
                amount={b.amount}
              />
            ))}
            {dueSubs.map((s) => (
              <DueCard
                key={`s${s.id}`}
                onClick={() => nav.go('plan')}
                tone="info"
                icon={<Repeat size={18} />}
                name={s.name}
                when={`Renews ${formatShortDate(`${s.nextDue}T12:00:00`)}`}
                amount={s.amount}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHeader title="Budgets" action={<LinkButton onClick={() => nav.go('settings')}>Manage</LinkButton>} />
        {categories.length === 0 ? (
          <Card><EmptyState icon={<Wallet size={24} />} title="No budgets yet" body="Create a budget to start tracking." action={<Button size="sm" onClick={() => nav.go('settings')}>Add a budget</Button>} /></Card>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {categories.map((c) => (
              <BudgetTile
                key={c.id}
                category={c}
                onOpen={() => setDetail(c.id)}
                onQuickSpend={() => nav.openAdd({ type: 'expense', categoryId: c.id })}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title="Recent" action={<LinkButton onClick={() => nav.go('activity')}>See all</LinkButton>} />
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {recent.length === 0 ? (
            <EmptyState title="Nothing logged yet" body="Tap + to add your first expense, or import a bank statement." />
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

function Hero({ o, streak }) {
  const money = useMoney();
  const nav = useNav();
  const used = o.pace.budget > 0 ? o.pace.spent / o.pace.budget : 0;
  const paceLabel = { under: 'Under pace', on: 'On pace', over: 'Over pace' }[o.pace.status];
  const paceDot = { under: '#7ef0c1', on: '#ffd36e', over: '#ff9fb4' }[o.pace.status];
  return (
    <section className="bg-hero hero-shine rounded-[30px] p-5 pb-4 shadow-brand" aria-label="Overview">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium text-hero-muted">Left in your budgets</p>
        <div className="flex items-center gap-1.5">
          <Badge tone="hero" className="h-7 px-2.5 text-[12px]">Grade {o.grade.grade}</Badge>
          {streak > 0 && <Badge tone="hero" className="h-7 px-2.5 text-[12px]"><Flame size={12} /> {streak}d</Badge>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 mt-1">
        <div className="min-w-0">
          <p className="num leading-[1.05] font-extrabold truncate" style={{ fontSize: heroSize(money(o.balance)) }}>{money(o.balance)}</p>
          <p className="text-sm text-hero-muted mt-1.5">
            <span className="font-bold text-hero-fg tabular">{money(o.safeToSpend)}</span> safe to spend
          </p>
        </div>
        <button type="button" onClick={nav.openCycle} className="press shrink-0 rounded-full" aria-label={`This week: ${Math.round(used * 100)}% of the weekly budget used. Open cycle details`}>
          <Ring value={o.pace.spent} max={o.pace.budget || 1} size={96} stroke={9} color="#ffffff" track="rgba(255,255,255,0.22)">
            <span className="text-center leading-none">
              <span className="num block text-xl font-extrabold">{Math.round(used * 100)}%</span>
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-hero-muted mt-1">of week</span>
            </span>
          </Ring>
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between text-[13px]">
        <span className="text-hero-muted">This week · <b className="text-hero-fg tabular font-semibold">{money(o.pace.spent)}</b> of <span className="tabular">{money(o.pace.budget)}</span></span>
        <span className="inline-flex items-center gap-1.5 font-semibold"><span className="w-2 h-2 rounded-full" style={{ background: paceDot }} />{paceLabel}</span>
      </div>
      <div className="relative mt-2 h-2 rounded-full bg-white/20 overflow-hidden" aria-hidden="true">
        <div className="h-full rounded-full bg-white anim-grow" style={{ width: `${Math.min(100, used * 100)}%` }} />
        <div className="absolute top-0 bottom-0 w-0.5 bg-white/70" style={{ left: `${Math.min(100, o.pace.elapsed * 100)}%` }} />
      </div>

      <div className="grid grid-cols-3 gap-2 mt-4">
        <HeroStat label="Per day" value={money(Math.round(o.pace.perDayLeft))} sub={`${o.pace.daysLeft}d left`} />
        <HeroStat label="This month" value={money(Math.round(o.monthSpent))} sub="spent" />
        <HeroStat label="Month end" value={formatMoneyCompact(Math.abs(o.forecastMonthEnd), money.symbol)} sub={o.forecastMonthEnd < 0 ? 'over budget' : 'under budget'} />
      </div>
    </section>
  );
}

const heroSize = (text) => (text.length > 11 ? 30 : text.length > 9 ? 36 : 44);

function HeroStat({ label, value, sub }) {
  return (
    <div className="hero-chip rounded-[18px] px-3 py-2.5 min-w-0">
      <p className="text-[11px] font-medium text-hero-muted truncate">{label}</p>
      <p className="num text-[17px] font-bold mt-0.5 truncate">{value}</p>
      <p className="text-[10.5px] text-hero-muted truncate">{sub}</p>
    </div>
  );
}

function QuickActions() {
  const nav = useNav();
  const items = [
    { label: 'Expense', Icon: Minus, color: 'var(--danger)', onClick: () => nav.openAdd({ type: 'expense' }) },
    { label: 'Income', Icon: Plus, color: 'var(--accent)', onClick: () => nav.openAdd({ type: 'income' }) },
    { label: 'Move', Icon: ArrowLeftRight, color: 'var(--info)', onClick: () => nav.openAdd({ type: 'transfer' }) },
    { label: 'Import', Icon: Upload, color: 'var(--brand)', onClick: () => nav.go('import') }
  ];
  return (
    <section className="grid grid-cols-4 gap-2 no-print" aria-label="Quick actions">
      {items.map(({ label, Icon, color, onClick }) => (
        <button key={label} type="button" onClick={onClick} className="press flex flex-col items-center gap-1.5 py-1">
          <span
            className="w-14 h-14 rounded-[20px] inline-flex items-center justify-center border border-line shadow-card"
            style={{ background: `color-mix(in srgb, ${color} 13%, var(--surface))`, color }}
          >
            <Icon size={23} strokeWidth={2.4} />
          </span>
          <span className="text-[12.5px] font-semibold text-ink">{label}</span>
        </button>
      ))}
    </section>
  );
}

function MonthStrip({ flow, now, onOpen }) {
  const money = useMoney();
  const total = Math.max(flow.income + flow.refunds, flow.spent, 1);
  const monthName = now.toLocaleDateString(undefined, { month: 'long' });
  return (
    <button type="button" onClick={onOpen} className="press w-full text-left bg-surface border border-line rounded-[26px] shadow-card p-4" aria-label={`${monthName} so far: ${money(flow.income + flow.refunds)} in, ${money(flow.spent)} out. Open insights`}>
      <div className="flex items-center justify-between">
        <p className="font-display text-[15px] font-bold">{monthName} so far</p>
        <span className={cx('text-[13px] font-semibold tabular', flow.net >= 0 ? 'text-accent-strong' : 'text-danger')}>
          {flow.net >= 0 ? '+' : '−'}{money(Math.abs(flow.net))} net
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <FlowBar icon={<ArrowDownLeft size={14} />} label="Money in" value={money(Math.round(flow.income + flow.refunds))} pct={(flow.income + flow.refunds) / total} color="var(--accent)" />
        <FlowBar icon={<ArrowUpRight size={14} />} label="Money out" value={money(Math.round(flow.spent))} pct={flow.spent / total} color="var(--danger)" />
      </div>
    </button>
  );
}

function FlowBar({ icon, label, value, pct, color }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted inline-flex items-center gap-1"><span style={{ color }}>{icon}</span>{label}</p>
      <p className="num text-lg font-bold mt-0.5 truncate">{value}</p>
      <div className="h-1.5 rounded-full bg-surface-3 mt-1.5 overflow-hidden">
        <div className="h-full rounded-full anim-grow" style={{ width: `${Math.max(pct > 0 ? 4 : 0, Math.min(100, pct * 100))}%`, background: color }} />
      </div>
    </div>
  );
}

function DueCard({ onClick, tone, icon, name, when, amount }) {
  const money = useMoney();
  const color = { danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--info)' }[tone];
  return (
    <button type="button" onClick={onClick} className="press snap-start shrink-0 w-[152px] text-left bg-surface border border-line rounded-[22px] shadow-card p-3.5">
      <span className="w-9 h-9 rounded-[12px] inline-flex items-center justify-center" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}>{icon}</span>
      <p className="text-[15px] font-semibold truncate mt-2.5">{name}</p>
      <p className="text-xs font-medium truncate" style={{ color }}>{when}</p>
      <p className="num text-lg font-bold mt-1">{money(amount)}</p>
    </button>
  );
}

export function BudgetTile({ category, onOpen, onQuickSpend }) {
  const money = useMoney();
  const limit = Number(category.limit) || 0;
  const left = Number(category.balance) || 0;
  const ratio = limit > 0 ? left / limit : 0;
  const tint = tintFor(category);
  const ringColor = left < 0 ? 'var(--danger)' : ratio < 0.2 ? 'var(--warn)' : tint;
  return (
    <div className="relative bg-surface border border-line rounded-[24px] shadow-card p-3.5 min-w-0">
      <button type="button" onClick={onOpen} className="press absolute inset-0 rounded-[24px] hover:bg-surface-2/60 transition" aria-label={`${category.name}: ${money(left)} ${left < 0 ? 'over' : 'left'}. Open details`} />
      <div className="relative flex items-start justify-between pointer-events-none">
        <Ring value={Math.max(0, left)} max={limit || 1} size={50} stroke={5} color={ringColor} track={`color-mix(in srgb, ${tint} 16%, var(--surface-2))`}>
          <span style={{ color: tint }}><CatIcon name={category.icon} size={20} /></span>
        </Ring>
        <button
          type="button"
          onClick={onQuickSpend}
          aria-label={`Add expense to ${category.name}`}
          className="press pointer-events-auto w-10 h-10 -mr-1 -mt-1 rounded-full bg-surface-2 border border-line text-muted hover:text-danger hover:bg-danger-soft inline-flex items-center justify-center transition"
        >
          <Minus size={19} strokeWidth={2.4} />
        </button>
      </div>
      <div className="relative pointer-events-none mt-3 min-w-0">
        <p className="flex items-center gap-1 text-[14px] font-semibold text-ink">
          <span className="truncate">{category.name}</span>
          {category.pinned && <Pin size={12} className="text-subtle shrink-0" aria-label="Pinned" />}
        </p>
        <p className={cx('num text-[22px] font-extrabold leading-tight mt-0.5 truncate', left < 0 ? 'text-danger' : 'text-ink')}>{money(left)}</p>
        <p className="text-[11.5px] text-muted truncate tabular">{left < 0 ? 'over' : 'left'} of {money(limit)} · {category.frequency === 'monthly' ? 'month' : 'week'}</p>
      </div>
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
  const limit = Number(category.limit) || 0;
  const left = Number(category.balance) || 0;
  const tint = tintFor(category);
  return (
    <>
      <Sheet open={!!id && !editing} onClose={onClose} title={category.name}>
        <div className="flex items-center gap-4 mb-5">
          <Ring value={Math.max(0, left)} max={limit || 1} size={76} stroke={7} color={left < 0 ? 'var(--danger)' : tint} track={`color-mix(in srgb, ${tint} 16%, var(--surface-2))`}>
            <span style={{ color: tint }}><CatIcon name={category.icon} size={28} /></span>
          </Ring>
          <div>
            <p className={cx('num text-3xl font-extrabold', left < 0 ? 'text-danger' : 'text-ink')}>{money(left)}</p>
            <p className="text-sm text-muted">{left < 0 ? 'over' : 'left'} of {money(limit)} · {category.frequency}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatTile label="Spent this month" value={money(Math.round(monthSpent))} />
          <StatTile label="Last rollover" value={category.lastRollover !== undefined && category.lastRollover !== null ? money(category.lastRollover, { signed: true }) : '—'} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="danger-soft" onClick={() => start(() => nav.openAdd({ type: 'expense', categoryId: id }))}><Minus size={18} /> Expense</Button>
          <Button variant="good" onClick={() => start(() => nav.openAdd({ type: 'income', categoryId: id }))}><Plus size={18} /> Income</Button>
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={16} /> Edit</Button>
          <Button variant="secondary" onClick={() => actions.togglePin(id)}>{category.pinned ? <><PinOff size={16} /> Unpin</> : <><Pin size={16} /> Pin to top</>}</Button>
        </div>
        <p className="font-display text-[15px] font-bold mt-6 mb-1">Recent in {category.name}</p>
        <div className="-mx-5 divide-y divide-[var(--border)]">
          {txs.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No entries yet.</p>
            : txs.slice(0, 8).map((t) => <TxRow key={t.id} tx={t} showDate onClick={() => start(() => nav.openTransaction(t))} />)}
        </div>
      </Sheet>
      <CategoryEditor open={editing} category={category} onClose={() => setEditing(false)} onDeleted={() => { setEditing(false); onClose(); }} />
    </>
  );
}

