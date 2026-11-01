import { useMemo } from 'react';
import { Minus, Repeat, ArrowLeftRight, RefreshCw, Scissors } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { formatMoney } from '../lib/money.js';
import { sortCategories } from '../lib/storage.js';
import { formatTime } from '../lib/dates.js';
import { txType } from '../lib/transactions.js';
import { CatIcon, tintFor } from '../ui/icons.jsx';
import { ProgressBar, cx } from '../ui/primitives.jsx';

export const useMoney = () => {
  const { state } = useStore();
  const symbol = state.prefs.currency || '$';
  return useMemo(() => {
    const fmt = (v, opts) => formatMoney(v, symbol, opts);
    fmt.symbol = symbol;
    return fmt;
  }, [symbol]);
};

export const useSortedCategories = () => {
  const { state } = useStore();
  return useMemo(() => sortCategories(state.categories), [state.categories]);
};

export function CategoryBadge({ category, size = 40, iconSize = 20 }) {
  const tint = tintFor(category);
  return (
    <span
      className="rounded-2xl flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${tint} 15%, transparent)`, color: tint }}
      aria-hidden="true"
    >
      <CatIcon name={category?.icon} size={iconSize} />
    </span>
  );
}

// Fixed grid: [badge] [name + bar] [left] [44px quick-spend]
export function CategoryRow({ category, onOpen, onQuickSpend }) {
  const money = useMoney();
  const limit = Number(category.limit) || 0;
  const left = Number(category.balance) || 0;
  const spent = Math.max(0, limit - left);
  const ratio = limit > 0 ? left / limit : 0;
  const tone = left < 0 ? 'danger' : ratio < 0.2 ? 'warn' : 'accent';
  return (
    <div className="grid grid-cols-[1fr_auto] items-center">
      <button type="button" onClick={onOpen} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 pl-4 pr-2 py-3 text-left min-h-[68px] hover:bg-surface-2 transition rounded-l-3xl">
        <CategoryBadge category={category} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="text-[15px] font-medium text-ink truncate">{category.name}</span>
            {category.pinned && <span className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Pinned</span>}
          </span>
          <ProgressBar value={Math.max(0, left)} max={limit || 1} tone={tone} className="mt-2" height={5} />
          <span className="block text-xs text-muted mt-1.5 tabular">
            {money(spent)} of {money(limit)} · {category.frequency === 'monthly' ? 'monthly' : 'weekly'}
          </span>
        </span>
        <span className="text-right pl-1">
          <span className={cx('block text-[15px] font-semibold tabular', left < 0 ? 'text-danger' : 'text-ink')}>{money(left)}</span>
          <span className="block text-[11px] text-subtle mt-0.5">{left < 0 ? 'over' : 'left'}</span>
        </span>
      </button>
      <div className="pr-3 pl-1 flex items-center">
        <button
          type="button"
          onClick={onQuickSpend}
          aria-label={`Add expense to ${category.name}`}
          className="w-11 h-11 rounded-2xl bg-surface-2 border border-line text-muted hover:text-danger hover:bg-danger-soft inline-flex items-center justify-center transition"
        >
          <Minus size={20} />
        </button>
      </div>
    </div>
  );
}

const txIcon = (tx, category) => {
  const t = txType(tx);
  if (t === 'transfer') return <span className="w-10 h-10 rounded-2xl bg-info-soft text-info flex items-center justify-center shrink-0"><ArrowLeftRight size={18} /></span>;
  if (t === 'system' || tx.categoryId === 'system') return <span className="w-10 h-10 rounded-2xl bg-surface-2 text-muted flex items-center justify-center shrink-0"><RefreshCw size={17} /></span>;
  return <CategoryBadge category={category || { name: tx.categoryName, icon: 'circle' }} />;
};

export function TxRow({ tx, onClick, showDate = false }) {
  const money = useMoney();
  const { state } = useStore();
  const category = state.categories.find((c) => c.id === tx.categoryId);
  const t = txType(tx);
  const isSystem = t === 'system' || (tx.categoryId === 'system' && t !== 'transfer');
  const amount = Number(tx.amount) || 0;
  const amountText = isSystem ? '' : t === 'income' ? money(amount, { signed: true }) : t === 'transfer' ? (amount ? money(amount) : '') : money(-amount);
  const meta = [
    t === 'transfer' ? 'Transfer' : isSystem ? 'Cycle' : (category?.name || tx.categoryName || 'Uncategorised'),
    showDate ? new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : formatTime(tx.date),
    ...(tx.tags || []).slice(0, 2).map((x) => `#${x}`)
  ].filter(Boolean).join(' · ');
  return (
    <button
      type="button"
      onClick={isSystem ? undefined : onClick}
      disabled={isSystem}
      className="w-full grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-3 min-h-[64px] text-left enabled:hover:bg-surface-2 transition disabled:cursor-default"
    >
      {txIcon(tx, category)}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className={cx('text-[15px] font-medium truncate', isSystem ? 'text-muted' : 'text-ink')}>{tx.description || 'Entry'}</span>
          {tx.recurring && tx.recurring !== 'none' && <Repeat size={13} className="text-subtle shrink-0" aria-label={`Repeats ${tx.recurring}`} />}
          {tx.isSplit && <Scissors size={13} className="text-subtle shrink-0" aria-label="Split" />}
        </span>
        <span className="block text-[13px] text-muted truncate mt-0.5">{meta}</span>
      </span>
      <span className={cx('text-[15px] font-semibold tabular text-right', t === 'income' ? 'text-accent-strong' : t === 'transfer' ? 'text-muted' : 'text-ink')}>
        {amountText}
      </span>
    </button>
  );
}

// Grid of category choices (replaces native <select>).
export function CategoryPicker({ value, onChange, categories, columns = 4, showBalance = true, exclude }) {
  const money = useMoney();
  const list = exclude ? categories.filter((c) => c.id !== exclude) : categories;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Category">
      {list.map((c) => {
        const active = c.id === value;
        const tint = tintFor(c);
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(c.id)}
            className={cx(
              'flex flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2.5 min-h-[76px] transition',
              active ? 'border-transparent' : 'border-line bg-surface hover:bg-surface-2'
            )}
            style={active ? { background: `color-mix(in srgb, ${tint} 16%, transparent)`, boxShadow: `inset 0 0 0 1.5px ${tint}` } : undefined}
          >
            <span style={{ color: tint }}><CatIcon name={c.icon} size={20} /></span>
            <span className="text-xs font-medium text-ink truncate max-w-full px-1">{c.name}</span>
            {showBalance && <span className={cx('text-[11px] tabular', c.balance < 0 ? 'text-danger' : 'text-subtle')}>{money(c.balance)}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function StatTile({ label, value, sub, tone }) {
  const toneCls = { good: 'text-accent-strong', warn: 'text-warn', bad: 'text-danger' }[tone] || 'text-ink';
  return (
    <div className="rounded-2xl bg-surface-2 border border-line px-3.5 py-3 min-w-0">
      <p className="text-xs text-muted truncate">{label}</p>
      <p className={cx('text-lg font-semibold tabular mt-0.5 truncate', toneCls)}>{value}</p>
      {sub && <p className="text-[11px] text-subtle mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

export function MarkdownText({ text }) {
  if (!text) return null;
  return (
    <div className="space-y-1.5">
      {String(text).split('\n').map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        const bullet = /^[-*•]\s+/.test(trimmed);
        const heading = /^#{1,4}\s+/.test(trimmed);
        const content = trimmed.replace(/^[-*•]\s+/, '').replace(/^#{1,4}\s+/, '');
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (
          p.startsWith('**') && p.endsWith('**') ? <strong key={j} className="font-semibold text-ink">{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>
        ));
        if (heading) return <p key={i} className="font-semibold text-ink pt-1">{parts}</p>;
        if (bullet) return <p key={i} className="pl-4 relative before:content-['•'] before:absolute before:left-0 before:text-subtle">{parts}</p>;
        return <p key={i}>{parts}</p>;
      })}
    </div>
  );
}
