import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheck, CircleAlert, Info } from 'lucide-react';
import { Button, Sheet, TextInput, cx } from './primitives.jsx';

const FeedbackContext = createContext(null);
export const useFeedback = () => useContext(FeedbackContext);

const CONFETTI_COLORS = ['#10b981', '#0ea5e9', '#8b5cf6', '#f43f5e', '#f59e0b'];

export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [confetti, setConfetti] = useState(0);
  const timer = useRef(null);

  const notify = useCallback((message, opts = {}) => {
    clearTimeout(timer.current);
    const id = Date.now();
    setToast({ id, message, tone: opts.tone || 'good', actionLabel: opts.actionLabel, onAction: opts.onAction });
    timer.current = setTimeout(() => setToast((t) => (t?.id === id ? null : t)), opts.duration || (opts.actionLabel ? 5500 : 3200));
  }, []);

  const ask = useCallback((opts) => new Promise((resolve) => {
    setTyped('');
    setConfirm({ ...opts, resolve });
  }), []);

  const celebrate = useCallback(() => {
    setConfetti(Date.now());
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!confetti) return undefined;
    const t = setTimeout(() => setConfetti(0), 2800);
    return () => clearTimeout(t);
  }, [confetti]);

  const closeConfirm = (result) => {
    confirm?.resolve(result);
    setConfirm(null);
    setBusy(false);
  };

  const value = useMemo(() => ({ notify, ask, celebrate }), [notify, ask, celebrate]);
  const ToneIcon = toast?.tone === 'bad' ? CircleAlert : toast?.tone === 'info' ? Info : CircleCheck;
  const needsTyping = confirm?.typeToConfirm;
  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed left-1/2 z-[80] anim-toast no-print w-[min(92vw,420px)]"
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)', transform: 'translateX(-50%)' }}
        >
          <div className="flex items-center gap-3 pl-4 pr-2 py-2 min-h-12 rounded-2xl bg-[#1a1d23] text-white border border-white/10 shadow-pop">
            <ToneIcon size={18} className={cx('shrink-0', toast.tone === 'bad' ? 'text-[#fb7185]' : 'text-[#34d399]')} />
            <span className="flex-1 text-sm font-medium">{toast.message}</span>
            {toast.actionLabel && (
              <button
                type="button"
                className="h-9 px-3 rounded-xl text-sm font-semibold text-[#34d399] hover:bg-white/10"
                onClick={() => { const fn = toast.onAction; setToast(null); fn?.(); }}
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
        </div>
      )}

      <Sheet open={!!confirm} onClose={() => closeConfirm(false)} title={confirm?.title} size="sm">
        {confirm?.message && <p className="text-[15px] text-muted leading-relaxed">{confirm.message}</p>}
        {needsTyping && (
          <div className="mt-4">
            <p className="text-sm text-muted mb-2">Type <b className="text-ink">{confirm.typeToConfirm}</b> to confirm.</p>
            <TextInput value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="characters" data-autofocus aria-label="Confirmation text" />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 mt-6">
          <Button variant="secondary" onClick={() => closeConfirm(false)}>{confirm?.cancelLabel || 'Cancel'}</Button>
          <Button
            variant={confirm?.destructive ? 'danger' : 'primary'}
            loading={busy}
            disabled={needsTyping && typed.trim().toUpperCase() !== confirm.typeToConfirm}
            onClick={() => { setBusy(true); closeConfirm(true); }}
            data-autofocus={needsTyping ? undefined : true}
          >
            {confirm?.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </Sheet>

      {confetti > 0 && (
        <div aria-hidden="true" key={confetti}>
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              className="confetti-piece"
              style={{
                left: `${(i * 37) % 100}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 9) * 0.06}s`,
                borderRadius: i % 3 === 0 ? '50%' : '2px'
              }}
            />
          ))}
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
