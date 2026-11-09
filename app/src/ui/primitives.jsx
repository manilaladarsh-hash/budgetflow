import { useEffect, useId, useRef } from 'react';
import { X, LoaderCircle } from 'lucide-react';

export const cx = (...parts) => parts.filter(Boolean).join(' ');

const BUTTON_VARIANTS = {
  primary: 'bg-brand-grad shadow-brand hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface-2 text-ink hover:bg-surface-3 border border-line',
  ghost: 'text-muted hover:text-ink hover:bg-surface-2',
  danger: 'bg-danger text-white hover:brightness-105',
  'danger-soft': 'bg-danger-soft text-danger hover:brightness-95',
  soft: 'bg-brand-soft text-brand-strong hover:brightness-95',
  good: 'bg-accent-soft text-accent-strong hover:brightness-95'
};
const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-sm rounded-full gap-1.5',
  md: 'h-11 px-5 text-[15px] rounded-full gap-2',
  lg: 'h-14 px-6 text-base rounded-full gap-2'
};

export function Button({ variant = 'primary', size = 'md', className, loading, children, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={cx(
        'press inline-flex items-center justify-center font-semibold transition select-none disabled:opacity-45 whitespace-nowrap',
        BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <LoaderCircle size={16} className="anim-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, size = 44, variant = 'ghost', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={cx('inline-flex items-center justify-center rounded-full transition shrink-0', BUTTON_VARIANTS[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Card({ className, children, as: As = 'section', ...rest }) {
  return (
    <As className={cx('bg-surface border border-line rounded-[26px] shadow-card', className)} {...rest}>
      {children}
    </As>
  );
}

export function SectionHeader({ title, action, className }) {
  return (
    <div className={cx('flex items-center justify-between px-1 mb-3 min-h-9', className)}>
      <h2 className="font-display text-[19px] font-bold tracking-tight text-ink">{title}</h2>
      {action}
    </div>
  );
}

export function Field({ label, hint, error, children, className }) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="block text-[13px] font-medium text-muted mb-1.5">{label}</span>}
      {children}
      {error ? <span className="block text-xs text-danger mt-1.5">{error}</span>
        : hint ? <span className="block text-xs text-subtle mt-1.5">{hint}</span> : null}
    </label>
  );
}

const inputClass = 'w-full h-12 px-4 rounded-2xl bg-surface-2 border border-line text-ink placeholder:text-subtle outline-none focus:border-brand focus:bg-surface transition';

export function TextInput({ className, ...rest }) {
  return <input className={cx(inputClass, className)} {...rest} />;
}

export function MoneyInput({ symbol, className, inputClassName, ...rest }) {
  return (
    <div className={cx('relative', className)}>
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-medium pointer-events-none">{symbol}</span>
      <input
        inputMode="decimal"
        autoComplete="off"
        className={cx(inputClass, 'tabular', symbol.length > 1 ? 'pl-14' : 'pl-8', inputClassName)}
        {...rest}
      />
    </div>
  );
}

export function TextArea({ className, ...rest }) {
  return <textarea className={cx(inputClass, 'h-auto py-3 min-h-24 resize-none', className)} {...rest} />;
}

export function Segmented({ options, value, onChange, className, size = 'md', ariaLabel }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cx('flex p-1 rounded-full bg-surface-2 border border-line', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cx(
              'flex-1 inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition whitespace-nowrap',
              size === 'sm' ? 'h-8 text-[13px] px-2' : 'h-10 text-sm px-2.5',
              active ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Chip({ active, onClick, children, className, tone = 'accent', ...rest }) {
  const activeTone = tone === 'danger' ? 'bg-danger-soft text-danger border-transparent' : 'bg-brand-soft text-brand-strong border-transparent';
  return (
    <button
      type="button"
      aria-pressed={!!active}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-sm font-medium border transition whitespace-nowrap',
        active ? activeTone : 'bg-surface border-line text-muted hover:text-ink',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-4 min-h-11">
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="block text-[15px] font-medium text-ink">{label}</span>
        {description && <span className="block text-[13px] text-muted mt-0.5">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative w-12 h-7 rounded-full transition shrink-0', checked ? 'bg-brand' : 'bg-surface-3')}
      >
        <span className={cx('absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  );
}

export function ProgressBar({ value, max = 1, tone = 'accent', marker, className, height = 6 }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = { accent: 'var(--accent)', brand: 'var(--brand)', warn: 'var(--warn)', danger: 'var(--danger)', info: 'var(--info)' }[tone] || tone;
  return (
    <div className={cx('relative w-full rounded-full bg-surface-3 overflow-hidden', className)} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      {marker !== undefined && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-ink/50" style={{ left: `${Math.max(0, Math.min(100, marker * 100))}%` }} aria-hidden="true" />
      )}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10">
      {icon && <div className="w-14 h-14 rounded-[20px] bg-brand-soft text-brand flex items-center justify-center mb-3">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="text-sm text-muted mt-1 max-w-72">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    good: 'bg-accent-soft text-accent-strong',
    brand: 'bg-brand-soft text-brand-strong',
    hero: 'hero-chip',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-danger-soft text-danger',
    info: 'bg-info-soft text-info'
  };
  return <span className={cx('inline-flex items-center gap-1 h-6 px-2 rounded-full text-xs font-semibold whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

// Bottom sheet on phones, centred dialog on larger screens.
export function Sheet({ open, onClose, title, children, footer, size = 'md', labelledBy }) {
  const panelRef = useRef(null);
  const lastFocus = useRef(null);
  // Keep the latest onClose without re-running the open/close effect (which
  // would steal focus back to the autofocus field on every render).
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    lastFocus.current = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeRef.current?.(); } };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const el = panelRef.current?.querySelector('[data-autofocus]');
      if (el) el.focus({ preventScroll: true });
      else panelRef.current?.focus({ preventScroll: true });
    }, 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus({ preventScroll: true });
    };
  }, [open]);
  if (!open) return null;
  const width = size === 'lg' ? 'md:max-w-2xl' : size === 'sm' ? 'md:max-w-sm' : 'md:max-w-lg';
  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center" role="presentation">
      <div className="absolute inset-0 anim-fade" style={{ background: 'var(--scrim)' }} onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : title}
        tabIndex={-1}
        className={cx('relative w-full bg-surface shadow-pop anim-sheet outline-none flex flex-col max-h-[92dvh] rounded-t-[28px] md:rounded-[28px]', width)}
      >
        <div className="md:hidden mx-auto mt-2.5 mb-1 h-1.5 w-10 rounded-full bg-surface-3" aria-hidden="true" />
        {title !== undefined && (
          <div className="flex items-center justify-between gap-3 px-5 pt-2 md:pt-5 pb-2">
            <h2 className="text-lg font-semibold text-ink truncate">{title}</h2>
            <IconButton label="Close" onClick={onClose} size={40} className="-mr-2"><X size={20} /></IconButton>
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
        {footer && <div className="px-5 pt-3 pb-5 border-t border-line safe-bottom">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ size = 18 }) {
  return <LoaderCircle size={size} className="anim-spin text-muted" aria-label="Loading" />;
}

export function ListRow({ icon, iconTint, title, subtitle, trailing, onClick, className, children }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx('w-full flex items-center gap-3 px-4 py-3 min-h-[60px] text-left', onClick && 'hover:bg-surface-2 transition', className)}
    >
      {icon && (
        <span
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: iconTint ? `color-mix(in srgb, ${iconTint} 14%, transparent)` : 'var(--surface-2)', color: iconTint || 'var(--muted)' }}
        >
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium text-ink truncate">{title}</span>
        {subtitle && <span className="block text-[13px] text-muted truncate mt-0.5">{subtitle}</span>}
        {children}
      </span>
      {trailing}
    </Tag>
  );
}

// Circular progress. value/max fills clockwise from 12 o'clock.
export function Ring({ value, max = 1, size = 56, stroke = 6, color = 'var(--accent)', track = 'var(--surface-3)', children, className, label }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const offset = c * (1 - pct);
  return (
    <div className={cx('relative shrink-0', className)} style={{ width: size, height: size }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="anim-ring"
            style={{ '--ring-from': c }}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex items-center justify-center">{children}</div>}
    </div>
  );
}
