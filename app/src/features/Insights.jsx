import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, TrendingUp, TrendingDown, CircleCheck, TriangleAlert, Info, ChartPie, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import {
  categorySpending, dailySeries, monthComparison, heatmap, insightsFor, monthlyBudget, monthlyHistory,
  cashFlow, merchantSpending, accountSpending, spendingEntries, merchantMatcher
} from '../lib/analytics.js';
import { formatMonth, sameMonth, shiftMonth, daysInMonth, formatShortDate } from '../lib/dates.js';
import { Card, SectionHeader, Segmented, EmptyState, IconButton, Sheet, cx } from '../ui/primitives.jsx';
import { tintFor, CatIcon } from '../ui/icons.jsx';
import { useMoney, StatTile, TxRow } from './shared.jsx';

export default function Insights() {
  const { state, now } = useStore();
  const nav = useNav();
  const money = useMoney();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const [range, setRange] = useState(7);
  const [view, setView] = useState('budgets');
  const [drill, setDrill] = useState(null);
  const isCurrent = sameMonth(month, now);

  const spending = useMemo(() => categorySpending(state.transactions, state.categories, month), [state.transactions, state.categories, month]);
  const merchants = useMemo(() => merchantSpending(state.transactions, month, 10), [state.transactions, month]);
  const accounts = useMemo(() => accountSpending(state.transactions, month), [state.transactions, month]);
  const flow = useMemo(() => cashFlow(state.transactions, month), [state.transactions, month]);
  const prevFlow = useMemo(() => cashFlow(state.transactions, shiftMonth(month, -1)), [state.transactions, month]);
  const series = useMemo(() => dailySeries(state.transactions, now, range), [state.transactions, now, range]);
  const comparison = useMemo(() => monthComparison(state.transactions, state.categories, month), [state.transactions, state.categories, month]);
  const heat = useMemo(() => heatmap(state.transactions, month), [state.transactions, month]);
  const notes = useMemo(() => insightsFor({ categories: state.categories, transactions: state.transactions, month, now }), [state, month, now]);
  const history = useMemo(() => monthlyHistory(state.transactions, 6), [state.transactions]);
  const budget = monthlyBudget(state.categories, month);
  const daysCounted = isCurrent ? Math.max(1, now.getDate()) : daysInMonth(month);
  const spent = flow.spent;
  const hasAccounts = accounts.some((a) => a.key !== 'Not set');

  const rows = view === 'merchants'
    ? merchants.map((m) => ({ id: `m:${m.key}`, name: m.name || 'No note', amount: m.amount, percentage: m.percentage, count: m.count, tint: tintFor(state.categories.find((c) => c.id === m.categoryId)), icon: state.categories.find((c) => c.id === m.categoryId)?.icon || 'circle', match: merchantMatcher(m.key) }))
    : view === 'cards'
      ? accounts.map((a, i) => ({ id: `a:${a.key}`, name: a.name, amount: a.amount, percentage: a.percentage, count: a.count, tint: CARD_TINTS[i % CARD_TINTS.length], icon: 'credit-card', match: (t) => (t.account || 'Not set') === a.key }))
      : spending.map((c) => ({ id: c.id, name: c.name, amount: c.amount, percentage: c.percentage, count: c.count, tint: tintFor(c), icon: c.icon, match: (t) => (t.categoryId === c.id || (!state.categories.some((x) => x.id === t.categoryId) && `name:${t.categoryName || 'Other'}` === c.id)) }));
  const drillEntries = drill ? spendingEntries(state.transactions, month, drill.match) : [];
  const spentChange = prevFlow.spent > 0 ? ((flow.spent - prevFlow.spent) / prevFlow.spent) * 100 : null;

  return (
    <div className="space-y-7 pt-1 stagger">
      <div className="flex items-center justify-between gap-2 bg-surface border border-line shadow-card rounded-full p-1.5">
        <IconButton label="Previous month" variant="secondary" size={40} onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={20} /></IconButton>
        <p className="font-display text-base font-bold">{formatMonth(month)}</p>
        <IconButton label="Next month" variant="secondary" size={40} disabled={isCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))} className="disabled:opacity-30"><ChevronRight size={20} /></IconButton>
      </div>

      {/* Money in vs out */}
      <section className="bg-hero hero-shine rounded-[30px] p-5 shadow-brand" aria-label="Money in and out">
        <p className="text-[13px] font-medium text-hero-muted">{flow.net >= 0 ? 'You kept' : 'You spent more than came in by'}</p>
        <p className="num text-[40px] leading-[1.05] font-extrabold mt-0.5">{money(Math.abs(Math.round(flow.net)))}</p>
        <p className="text-sm text-hero-muted mt-1">
          {flow.savingsRate !== null ? <><b className="text-hero-fg">{Math.round(flow.savingsRate)}%</b> of your income saved</> : 'No income recorded this month'}
        </p>
        <div className="mt-4 space-y-3">
          <FlowRow icon={<ArrowDownLeft size={15} />} label="Money in" value={money(Math.round(flow.income + flow.refunds))} pct={(flow.income + flow.refunds) / Math.max(flow.income + flow.refunds, flow.spent, 1)} sub={flow.refunds > 0 ? `incl. ${money(Math.round(flow.refunds))} refunds` : undefined} />
          <FlowRow icon={<ArrowUpRight size={15} />} label="Money out" value={money(Math.round(flow.spent))} pct={flow.spent / Math.max(flow.income + flow.refunds, flow.spent, 1)} sub={spentChange !== null ? `${spentChange > 0 ? '+' : ''}${Math.round(spentChange)}% vs ${shiftMonth(month, -1).toLocaleDateString(undefined, { month: 'short' })}` : undefined} />
        </div>
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Spent vs budget" value={money(Math.round(spent))} sub={budget ? `of ~${money(Math.round(budget))}` : undefined} tone={budget && spent > budget ? 'bad' : undefined} />
        <StatTile label="Daily average" value={money(Math.round(spent / daysCounted))} sub={`target ${money(Math.round(budget / daysInMonth(month)))}/day`} tone={spent / daysCounted > budget / daysInMonth(month) ? 'warn' : 'good'} />
      </div>

      {/* Where it went */}
      <section>
        <SectionHeader title="Where it went" />
        <Card className="p-4 sm:p-5">
          <Segmented
            ariaLabel="Group spending by"
            size="sm"
            value={view}
            onChange={setView}
            options={[{ value: 'budgets', label: 'Budgets' }, { value: 'merchants', label: 'Merchants' }, { value: 'cards', label: 'Cards' }]}
          />
          {rows.length === 0 ? (
            <EmptyState icon={<ChartPie size={24} />} title="No spending this month" body="Log expenses or import a statement to see where your money goes." />
          ) : (
            <>
              {view === 'cards' && !hasAccounts && (
                <p className="text-[13px] text-muted mt-3">Entries you add by hand have no card. Imported statements and Apple Pay entries are grouped by card here.</p>
              )}
              <div className="flex h-3.5 rounded-full overflow-hidden gap-[2px] mt-4" aria-hidden="true">
                {rows.slice(0, 8).map((r) => <div key={r.id} className="anim-grow" style={{ width: `${r.percentage}%`, background: r.tint, minWidth: 3 }} />)}
              </div>
              <ul className="mt-3 -mx-2">
                {rows.slice(0, 10).map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setDrill(r)} className="press w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl hover:bg-surface-2 text-left" aria-label={`${r.name}: ${money(Math.round(r.amount))}, ${Math.round(r.percentage)}%. Show entries`}>
                      <span className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${r.tint} 15%, transparent)`, color: r.tint }}><CatIcon name={r.icon} size={18} /></span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[15px] font-semibold truncate">{r.name}</span>
                          <span className="num text-[15px] font-bold shrink-0">{money(Math.round(r.amount))}</span>
                        </span>
                        <span className="flex items-center gap-2 mt-1.5">
                          <span className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden"><span className="block h-full rounded-full anim-grow" style={{ width: `${Math.max(2, r.percentage)}%`, background: r.tint }} /></span>
                          <span className="text-xs text-muted tabular w-16 text-right">{Math.round(r.percentage)}% · {r.count}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </section>

      <section>
        <SectionHeader title="Daily spending" action={<Segmented size="sm" ariaLabel="Range" value={range} onChange={setRange} className="w-44" options={[{ value: 7, label: '7d' }, { value: 14, label: '14d' }, { value: 30, label: '30d' }]} />} />
        <Card className="p-5">
          <Bars series={series} money={money} />
        </Card>
      </section>

      {notes.length > 0 && (
        <section>
          <SectionHeader title="Highlights" />
          <div className="space-y-2.5">
            {notes.map((n, i) => {
              const Icon = n.tone === 'good' ? CircleCheck : n.tone === 'bad' ? TriangleAlert : n.tone === 'warn' ? TrendingUp : Info;
              const color = { good: 'var(--accent)', bad: 'var(--danger)', warn: 'var(--warn)', info: 'var(--brand)' }[n.tone];
              return (
                <div key={i} className="flex items-start gap-3 bg-surface border border-line shadow-card rounded-[22px] px-4 py-3.5">
                  <span className="w-9 h-9 rounded-[12px] inline-flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}><Icon size={18} /></span>
                  <p className="text-[15px] text-ink leading-snug pt-1.5">{n.text}{n.amount !== undefined && <> <b className="font-bold tabular">{money(Math.round(n.amount))}</b>.</>}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {comparison.rows.length > 0 && (
        <section>
          <SectionHeader title={`Compared with ${comparison.previousMonth.toLocaleDateString(undefined, { month: 'long' })}`} />
          <Card className="p-5 space-y-4">
            {comparison.rows.slice(0, 8).map((r) => {
              const max = Math.max(r.current, r.previous, 1);
              return (
                <div key={r.id}>
                  <div className="flex items-center justify-between text-[15px]">
                    <span className="flex items-center gap-2 min-w-0"><span style={{ color: tintFor(r) }}><CatIcon name={r.icon} size={16} /></span><span className="truncate font-medium">{r.name}</span></span>
                    <span className="flex items-center gap-2 tabular">
                      <span className="num font-bold">{money(Math.round(r.current))}</span>
                      {r.change !== null && (
                        <span className={cx('text-xs font-semibold inline-flex items-center gap-0.5 h-6 px-1.5 rounded-full', r.change > 0 ? 'text-danger bg-danger-soft' : 'text-accent-strong bg-accent-soft')}>
                          {r.change > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(Math.round(r.change))}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="h-2 rounded-full anim-grow" style={{ width: `${(r.current / max) * 100}%`, minWidth: r.current ? 4 : 0, background: tintFor(r) }} />
                    <div className="h-2 rounded-full bg-surface-3" style={{ width: `${(r.previous / max) * 100}%`, minWidth: r.previous ? 4 : 0 }} />
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-subtle">Coloured bar: this month · grey bar: last month</p>
          </Card>
        </section>
      )}

      <section>
        <SectionHeader title="Calendar" />
        <Card className="p-5">
          <Heatmap heat={heat} money={money} />
        </Card>
      </section>

      <section>
        <button type="button" onClick={() => nav.go(state.prefs.geminiKey ? 'assistant' : 'settings')} className="press w-full text-left bg-surface border border-line shadow-card rounded-[26px] p-5 flex items-center gap-4">
          <span className="w-12 h-12 rounded-[16px] bg-brand-grad shadow-brand flex items-center justify-center shrink-0"><Sparkles size={22} /></span>
          <span className="flex-1 min-w-0">
            <span className="block font-display font-bold">Ask about your spending</span>
            <span className="block text-sm text-muted">{state.prefs.geminiKey ? 'Chat, monthly report card and budget tune-up.' : 'Optional: add a Gemini key in Settings.'}</span>
          </span>
          <span className="text-sm font-semibold text-brand inline-flex items-center">{state.prefs.geminiKey ? 'Open' : 'Set up'}<ChevronRight size={16} /></span>
        </button>
      </section>

      {(history.length > 1 || state.cycleHistory.length > 0) && (
        <section>
          <SectionHeader title="History" />
          <Card className="divide-y divide-[var(--border)]">
            {history.map((h) => {
              const max = Math.max(...history.map((x) => x.total), 1);
              return (
                <div key={h.key} className="px-4 py-3">
                  <div className="flex justify-between text-[15px]"><span className="font-medium">{formatMonth(h.month)}</span><span className="num font-bold">{money(Math.round(h.total))}</span></div>
                  <div className="h-1.5 mt-2 rounded-full bg-brand-grad anim-grow" style={{ width: `${(h.total / max) * 100}%` }} />
                </div>
              );
            })}
            {state.cycleHistory.slice(-6).reverse().map((c) => (
              <div key={`${c.cycle}-${c.endDate}`} className="px-4 py-3 flex justify-between text-[15px]">
                <span className="text-muted">Cycle {c.cycle} · {formatShortDate(c.startDate)}–{formatShortDate(new Date(new Date(c.endDate) - 1))}</span>
                <span className="num font-bold">{money(Math.round(c.totalSpent || 0))}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      <Sheet open={!!drill} onClose={() => setDrill(null)} title={drill?.name}>
        {drill && (
          <>
            <div className="flex items-center gap-3 mb-3">
              <span className="w-12 h-12 rounded-[16px] flex items-center justify-center" style={{ background: `color-mix(in srgb, ${drill.tint} 15%, transparent)`, color: drill.tint }}><CatIcon name={drill.icon} size={22} /></span>
              <div>
                <p className="num text-2xl font-extrabold">{money(drill.amount)}</p>
                <p className="text-sm text-muted">{drillEntries.length} {drillEntries.length === 1 ? 'entry' : 'entries'} · {Math.round(drill.percentage)}% of {formatMonth(month)}</p>
              </div>
            </div>
            <div className="-mx-5 divide-y divide-[var(--border)]">
              {drillEntries.map((t) => <TxRow key={t.id} tx={t} showDate onClick={() => { setDrill(null); setTimeout(() => nav.openTransaction(t), 50); }} />)}
            </div>
          </>
        )}
      </Sheet>
    </div>
  );
}

const CARD_TINTS = ['#6a4cf5', '#0ea5e9', '#f97316', '#14b8a6', '#ec4899', '#f59e0b', '#64748b'];

function FlowRow({ icon, label, value, pct, sub }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-hero-muted inline-flex items-center gap-1">{icon}{label}</span>
        <span className="num text-lg font-bold">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-white/20 mt-1.5 overflow-hidden">
        <div className="h-full rounded-full bg-white anim-grow" style={{ width: `${Math.max(pct > 0 ? 3 : 0, Math.min(100, pct * 100))}%` }} />
      </div>
      {sub && <p className="text-[11.5px] text-hero-muted mt-1">{sub}</p>}
    </div>
  );
}

function Bars({ series, money }) {
  const { days, max, avg } = series;
  const h = 132;
  const top = Math.max(max, 1);
  const dense = days.length > 14;
  return (
    <div>
      <div className="flex justify-between text-xs text-muted mb-3">
        <span>Average <b className="text-ink tabular">{money(Math.round(avg))}</b>/day</span>
        <span>Peak <b className="text-ink tabular">{money(Math.round(max))}</b></span>
      </div>
      <div className="relative" style={{ height: h }}>
        {avg > 0 && <div className="absolute inset-x-0 border-t border-dashed border-line-strong" style={{ bottom: `${(avg / top) * 100}%` }} aria-hidden="true" />}
        <div className={cx('absolute inset-0 flex items-end', dense ? 'gap-[3px]' : 'gap-2')}>
          {days.map((d, i) => (
            <div key={d.key} className="flex-1 h-full flex items-end" title={`${d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${money(d.total)}`}>
              <div
                className="w-full rounded-md transition-[height] duration-500"
                style={{
                  height: `${d.total > 0 ? Math.max(4, (d.total / top) * 100) : 2}%`,
                  background: d.total > avg && avg > 0 ? 'linear-gradient(180deg, #ff8fb1, #e2335b)' : i === days.length - 1 ? 'linear-gradient(180deg, #a48bff, var(--brand))' : 'color-mix(in srgb, var(--brand) 45%, transparent)'
                }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className={cx('flex mt-2', dense ? 'gap-[3px]' : 'gap-2')}>
        {days.map((d, i) => (
          <span key={d.key} className="flex-1 text-center text-[10px] text-subtle tabular">
            {dense ? (i % 5 === 0 || i === days.length - 1 ? d.date.getDate() : '') : d.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
          </span>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ heat, money }) {
  const labels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5">
        {labels.map((l, i) => <span key={i} className="text-center text-[11px] font-medium text-subtle pb-1">{l}</span>)}
        {heat.cells.map((cell, i) => {
          if (!cell) return <span key={`e${i}`} />;
          const ratio = heat.max > 0 ? cell.total / heat.max : 0;
          return (
            <span
              key={cell.key}
              className="aspect-square rounded-lg flex items-center justify-center text-[11px] tabular"
              title={`${cell.key}: ${money(cell.total)}`}
              style={{
                background: cell.total > 0 ? `color-mix(in srgb, var(--brand) ${Math.round(18 + ratio * 72)}%, var(--surface-2))` : 'var(--surface-2)',
                color: ratio > 0.55 ? '#fff' : 'var(--muted)'
              }}
            >
              {cell.day}
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-3 text-[11px] text-subtle">
        Less
        {[0, 0.33, 0.66, 1].map((r) => <span key={r} className="w-3.5 h-3.5 rounded" style={{ background: r === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--brand) ${Math.round(18 + r * 72)}%, var(--surface-2))` }} />)}
        More
      </div>
    </div>
  );
}
