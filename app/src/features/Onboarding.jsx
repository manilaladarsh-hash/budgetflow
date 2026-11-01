import { useState } from 'react';
import { Wallet, ArrowRight, X, Upload } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useFeedback } from '../ui/feedback.jsx';
import { CURRENCIES, parseAmount, roundMoney } from '../lib/money.js';
import { parseBackup } from '../lib/backup.js';
import { Button, TextInput, Chip, MoneyInput, cx } from '../ui/primitives.jsx';
import { CategoryBadge } from './shared.jsx';

export default function Onboarding() {
  const { state, actions } = useStore();
  const { notify, ask } = useFeedback();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(state.prefs.name);
  const [currency, setCurrency] = useState(state.prefs.currency || '$');
  const [budgets, setBudgets] = useState(() => state.categories.map((c) => ({ ...c, draft: String(c.limit) })));
  const hasHistory = state.transactions.length > 0;
  const lastStep = hasHistory ? 1 : 2;

  const finish = () => {
    if (!hasHistory) {
      const keep = budgets.filter((b) => !b.removed);
      state.categories.forEach((c) => { if (!keep.some((k) => k.id === c.id)) actions.deleteCategory(c.id); });
      keep.forEach((b) => {
        const limit = parseAmount(b.draft);
        if (Number.isFinite(limit) && limit >= 0 && limit !== b.limit) actions.updateCategory(b.id, { limit: roundMoney(limit), balance: roundMoney(limit) });
      });
    }
    actions.setPrefs({ onboarded: true, name: name.trim(), currency });
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const restored = parseBackup(await file.text(), state);
      const ok = await ask({ title: 'Restore this backup?', message: `${restored.transactions.length} entries and ${restored.categories.length} budgets will be loaded.`, confirmLabel: 'Restore' });
      if (ok) { actions.restoreBackup(restored); notify('Backup restored'); }
    } catch (err) {
      notify(err.message || 'That file could not be read', { tone: 'bad' });
    }
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="flex gap-1.5 justify-center mb-8" aria-hidden="true">
          {Array.from({ length: lastStep + 1 }, (_, i) => <span key={i} className={cx('h-1.5 rounded-full transition-all', i === step ? 'w-8 bg-accent' : 'w-3 bg-surface-3')} />)}
        </div>

        {step === 0 && (
          <div className="text-center anim-pop">
            <div className="w-16 h-16 rounded-3xl bg-accent text-accent-fg inline-flex items-center justify-center shadow-pop"><Wallet size={30} /></div>
            <h1 className="text-3xl font-semibold tracking-tight mt-6">BudgetFlow</h1>
            <p className="text-muted mt-2 text-[15px]">Simple weekly budgets that refill every Sunday, with rollover, goals and bills in one place.</p>
            <div className="mt-8 text-left">
              <label className="block text-[13px] font-medium text-muted mb-1.5" htmlFor="ob-name">What should we call you?</label>
              <TextInput id="ob-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') setStep(1); }} />
            </div>
            <Button size="lg" className="w-full mt-4" onClick={() => setStep(1)}>Continue <ArrowRight size={18} /></Button>
            <label className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted cursor-pointer h-10">
              <Upload size={15} /> Restore from a backup file
              <input type="file" accept="application/json,.json" hidden onChange={restore} />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="anim-pop">
            <h1 className="text-2xl font-semibold tracking-tight text-center">Your currency</h1>
            <p className="text-muted mt-2 text-center text-[15px]">Used for every amount in the app. You can change it later.</p>
            <div className="grid grid-cols-5 gap-2 mt-6" role="radiogroup" aria-label="Currency">
              {CURRENCIES.map((c) => (
                <Chip key={c} role="radio" aria-checked={currency === c} active={currency === c} onClick={() => setCurrency(c)} className="h-12 justify-center text-base rounded-2xl">{c}</Chip>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-8">
              <Button variant="secondary" size="lg" onClick={() => setStep(0)}>Back</Button>
              <Button size="lg" onClick={() => (lastStep === 1 ? finish() : setStep(2))}>{lastStep === 1 ? 'Start' : 'Continue'}</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="anim-pop">
            <h1 className="text-2xl font-semibold tracking-tight text-center">Starter budgets</h1>
            <p className="text-muted mt-2 text-center text-[15px]">Adjust the amounts or remove what you don't need. You can add more any time.</p>
            <div className="mt-6 space-y-2">
              {budgets.filter((b) => !b.removed).map((b) => (
                <div key={b.id} className="flex items-center gap-3 rounded-2xl bg-surface border border-line p-2.5 pl-3">
                  <CategoryBadge category={b} size={36} iconSize={18} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium truncate">{b.name}</p>
                    <p className="text-xs text-muted">{b.frequency}</p>
                  </div>
                  <MoneyInput symbol={currency} value={b.draft} onChange={(e) => setBudgets((list) => list.map((x) => (x.id === b.id ? { ...x, draft: e.target.value } : x)))} className="w-28" inputClassName="h-11" aria-label={`${b.name} budget`} />
                  <button type="button" aria-label={`Remove ${b.name}`} onClick={() => setBudgets((list) => list.map((x) => (x.id === b.id ? { ...x, removed: true } : x)))} className="w-10 h-10 rounded-full inline-flex items-center justify-center text-subtle hover:text-danger"><X size={18} /></button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3 mt-8">
              <Button variant="secondary" size="lg" onClick={() => setStep(1)}>Back</Button>
              <Button size="lg" onClick={finish}>Start budgeting</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
