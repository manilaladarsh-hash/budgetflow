import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, TrendingUp, TrendingDown, CircleCheck, TriangleAlert, Info, ChartPie } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import {
  categorySpending, dailySeries, monthComparison, heatmap, insightsFor, spentInMonth, incomeInMonth, monthlyBudget, monthlyHistory
} from '../lib/analytics.js';
import { formatMonth, sameMonth, shiftMonth, daysInMonth, formatShortDate } from '../lib/dates.js';
import { Card, SectionHeader, Segmented, EmptyState, IconButton, Button, cx } from '../ui/primitives.jsx';
import { tintFor, CatIcon } from '../ui/icons.jsx';
import { useMoney, StatTile } from './shared.jsx';

export default function Insights() {
  const { state, now } = useStore();
  const nav = useNav();
  const money = useMoney();
  const [month, setMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1, 12));
  const [range, setRange] = useState(7);
  const isCurrent = sameMonth(month, now);

  const spending = useMemo(() => categorySpending(state.transactions, state.categories, month), [state.transactions, state.categories, month]);
  const spent = useMemo(() => spentInMonth(state.transactions, month), [state.transactions, month]);
  const income = useMemo(() => incomeInMonth(state.transactions, month), [state.transactions, month]);
  const series = useMemo(() => dailySeries(state.transactions, now, range), [state.transactions, now, range]);
  const comparison = useMemo(() => monthComparison(state.transactions, state.categories, month), [state.transactions, state.categories, month]);
  const heat = useMemo(() => heatmap(state.transactions, month), [state.transactions, month]);
  const notes = useMemo(() => insightsFor({ categories: state.categories, transactions: state.transactions, month, now }), [state, month, now]);
  const history = useMemo(() => monthlyHistory(state.transactions, 6), [state.transactions]);
  const budget = monthlyBudget(state.categories, month);
  const daysCounted = isCurrent ? Math.max(1, now.getDate()) : daysInMonth(month);

  return (
    <div className="space-y-6 pt-2">
      <div className="flex items-center justify-between gap-2">
        <IconButton label="Previous month" variant="secondary" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft size={20} /></IconButton>
        <p className="text-base font-semibold">{formatMonth(month)}</p>
        <IconButton label="Next month" variant="secondary" disabled={isCurrent} onClick={() => setMonth((m) => shiftMonth(m, 1))} className="disabled:opacity-30"><ChevronRight size={20} /></IconButton>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile label="Spent" value={money(Math.round(spent))} sub={budget ? `of ~${money(Math.round(budget))} budget` : undefined} tone={budget && spent > budget ? 'bad' : undefined} />
        <StatTile label="Income" value={money(Math.round(income))} sub={income > 0 ? `${Math.round(((income - spent) / income) * 100)}% saved` : 'none logged'} tone={income > 0 ? 'good' : undefined} />
        <StatTile label="Daily average" value={money(Math.round(spent / daysCounted))} sub={`target ${money(Math.round(budget / daysInMonth(month)))}/day`} tone={spent / daysCounted > budget / daysInMonth(month) ? 'warn' : undefined} />
        <StatTile
          label={`vs ${comparison.previousMonth.toLocaleDateString(undefined, { month: 'short' })}`}
          value={comparison.totalChange === null ? '—' : `${comparison.totalChange > 0 ? '+' : ''}${Math.round(comparison.totalChange)}%`}
          sub={`${money(Math.round(comparison.previousTotal))} last month`}
          tone={comparison.totalChange === null ? undefined : comparison.totalChange > 0 ? 'warn' : 'good'}
        />
      </div>

      <section>
        <SectionHeader title="Where it went" />
        <Card className="p-5">
          {spending.length === 0 ? (
            <EmptyState icon={<ChartPie size={22} />} title="No spending this month" body="Charts appear once you log expenses." />
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <Donut data={spending} total={spent} money={money} />
              <ul className="w-full space-y-2.5">
                {spending.slice(0, 8).map((c) => (
                  <li key={c.id} className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tintFor(c) }} aria-hidden="true" />
                    <span className="flex-1 min-w-0 text-[15px] truncate">{c.name}</span>
                    <span className="text-sm text-muted tabular">{Math.round(c.percentage)}%</span>
                    <span className="text-[15px] font-semibold tabular w-20 text-right">{money(Math.round(c.amount))}</span>
                  </li>
                ))}
              </ul>
            </div>
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
          <Card className="divide-y divide-[var(--border)]">
            {notes.map((n, i) => {
              const Icon = n.tone === 'good' ? CircleCheck : n.tone === 'bad' ? TriangleAlert : n.tone === 'warn' ? TrendingUp : Info;
              const color = { good: 'text-accent-strong', bad: 'text-danger', warn: 'text-warn', info: 'text-info' }[n.tone];
              return (
                <div key={i} className="flex gap-3 px-4 py-3.5">
                  <Icon size={18} className={cx('shrink-0 mt-0.5', color)} />
                  <p className="text-[15px] text-ink leading-snug">{n.text}{n.amount !== undefined && <> <b className="font-semibold tabular">{money(Math.round(n.amount))}</b>.</>}</p>
                </div>
              );
            })}
          </Card>
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
                    <span className="flex items-center gap-2 min-w-0"><span style={{ color: tintFor(r) }}><CatIcon name={r.icon} size={16} /></span><span className="truncate">{r.name}</span></span>
                    <span className="flex items-center gap-2 tabular">
                      <span className="font-semibold">{money(Math.round(r.current))}</span>
                      {r.change !== null && (
                        <span className={cx('text-xs font-semibold inline-flex items-center', r.change > 0 ? 'text-danger' : 'text-accent-strong')}>
                          {r.change > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(Math.round(r.change))}%
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="h-2 rounded-full" style={{ width: `${(r.current / max) * 100}%`, minWidth: r.current ? 4 : 0, background: tintFor(r) }} />
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
        <SectionHeader title="AI assistant" />
        <Card className="p-5 flex items-center gap-4">
          <span className="w-11 h-11 rounded-2xl bg-accent-soft text-accent-strong flex items-center justify-center shrink-0"><Sparkles size={20} /></span>
          <div className="flex-1 min-w-0">
            <p className="font-medium">Ask about your spending</p>
            <p className="text-sm text-muted">{state.prefs.geminiKey ? 'Chat, monthly report card and budget tune-up.' : 'Optional — add a Gemini key in Settings.'}</p>
          </div>
          <Button size="sm" variant={state.prefs.geminiKey ? 'primary' : 'secondary'} onClick={() => nav.go(state.prefs.geminiKey ? 'assistant' : 'settings')}>{state.prefs.geminiKey ? 'Open' : 'Set up'}</Button>
        </Card>
      </section>

      {(history.length > 1 || state.cycleHistory.length > 0) && (
        <section>
          <SectionHeader title="History" />
          <Card className="divide-y divide-[var(--border)]">
            {history.map((h) => {
              const max = Math.max(...history.map((x) => x.total), 1);
              return (
                <div key={h.key} className="px-4 py-3">
                  <div className="flex justify-between text-[15px]"><span>{formatMonth(h.month)}</span><span className="font-semibold tabular">{money(Math.round(h.total))}</span></div>
                  <div className="h-1.5 mt-2 rounded-full bg-accent/70" style={{ width: `${(h.total / max) * 100}%` }} />
                </div>
              );
            })}
            {state.cycleHistory.slice(-6).reverse().map((c) => (
              <div key={`${c.cycle}-${c.endDate}`} className="px-4 py-3 flex justify-between text-[15px]">
                <span className="text-muted">Cycle {c.cycle} · {formatShortDate(c.startDate)}–{formatShortDate(new Date(new Date(c.endDate) - 1))}</span>
                <span className="font-semibold tabular">{money(Math.round(c.totalSpent || 0))}</span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

function Donut({ data, total, money }) {
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Spending by budget">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        {data.map((d) => {
          const len = (d.percentage / 100) * c;
          const gap = data.length > 1 ? Math.min(3, len / 3) : 0;
          const el = (
            <circle
              key={d.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={tintFor(d)}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            >
              <title>{`${d.name}: ${Math.round(d.percentage)}%`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted">Total</span>
        <span className="text-xl font-semibold tabular">{money(Math.round(total))}</span>
      </div>
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
                className="w-full rounded-t-md transition-[height] duration-500"
                style={{
                  height: `${d.total > 0 ? Math.max(4, (d.total / top) * 100) : 2}%`,
                  background: d.total > avg && avg > 0 ? 'var(--warn)' : i === days.length - 1 ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 55%, transparent)'
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
                background: cell.total > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(18 + ratio * 72)}%, var(--surface-2))` : 'var(--surface-2)',
                color: ratio > 0.55 ? 'var(--accent-fg)' : 'var(--muted)'
              }}
            >
              {cell.day}
            </span>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-1.5 mt-3 text-[11px] text-subtle">
        Less
        {[0, 0.33, 0.66, 1].map((r) => <span key={r} className="w-3.5 h-3.5 rounded" style={{ background: r === 0 ? 'var(--surface-2)' : `color-mix(in srgb, var(--accent) ${Math.round(18 + r * 72)}%, var(--surface-2))` }} />)}
        More
      </div>
    </div>
  );
}
