import { useMemo } from 'react';
import { useStore } from '../state/store.jsx';
import { cycleEndFor, rolloverPreview, ROLLOVER_CAP } from '../lib/cycle.js';
import { formatCountdown, formatDay } from '../lib/dates.js';
import { Sheet, ProgressBar, cx } from '../ui/primitives.jsx';
import { CategoryBadge, useMoney } from './shared.jsx';

export default function CycleSheet({ open, onClose }) {
  const { state, now } = useStore();
  const money = useMoney();
  const end = cycleEndFor(state.cycleStartDate);
  const start = new Date(state.cycleStartDate);
  const elapsed = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const preview = useMemo(() => rolloverPreview(state.categories, state.cycleStartDate), [state.categories, state.cycleStartDate]);

  return (
    <Sheet open={open} onClose={onClose} title={`Cycle ${state.weeksTracked}`}>
      <div className="rounded-2xl bg-surface-2 border border-line p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">Renews in</span>
          <span className="text-2xl font-semibold tabular">{formatCountdown(end - now)}</span>
        </div>
        <ProgressBar value={elapsed} max={1} className="mt-3" height={8} />
        <div className="flex justify-between text-xs text-subtle mt-2">
          <span>{formatDay(start)}</span>
          <span>{formatDay(end)} · 12:00 am</span>
        </div>
      </div>
      <p className="text-sm text-muted mt-4 leading-relaxed">
        Every Sunday at midnight, weekly budgets refill. Up to {Math.round(ROLLOVER_CAP * 100)}% of a budget's unspent money carries over; overspending carries over in full.
        Monthly budgets refill on the first cycle of a new month. Repeating entries are added automatically.
      </p>
      <p className="text-[13px] font-semibold uppercase tracking-wide text-subtle mt-6 mb-2">At the next renewal</p>
      <div className="-mx-5 divide-y divide-[var(--border)]">
        {preview.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-5 py-3">
            <CategoryBadge category={c} size={36} iconSize={18} />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-medium truncate">{c.name}</p>
              <p className="text-xs text-muted">{c.resets ? `Rollover ${money(c.rollover, { signed: true })}` : 'Not renewing this time'}</p>
            </div>
            <div className="text-right tabular">
              <p className={cx('text-[15px] font-semibold', c.nextBalance < 0 && 'text-danger')}>{money(c.nextBalance)}</p>
              <p className="text-xs text-subtle">now {money(c.balance)}</p>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
