import { useEffect, useState } from 'react';
import { Trash2, Copy, ArrowLeftRight } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { useFeedback } from '../ui/feedback.jsx';
import { parseAmount, roundMoney } from '../lib/money.js';
import { localDayKey, isoForDay, formatDay, formatTime } from '../lib/dates.js';
import { txType } from '../lib/transactions.js';
import { Sheet, Segmented, MoneyInput, TextInput, Chip, Button, Field } from '../ui/primitives.jsx';
import { CategoryPicker, useMoney, useSortedCategories } from './shared.jsx';

export default function TransactionSheet({ tx, onClose }) {
  const { state, actions } = useStore();
  const nav = useNav();
  const { notify } = useFeedback();
  const money = useMoney();
  const categories = useSortedCategories();
  const [form, setForm] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tx) return;
    setError('');
    setForm({
      type: txType(tx) === 'income' ? 'income' : 'expense',
      amount: String(tx.amount ?? ''),
      categoryId: tx.categoryId,
      description: tx.description || '',
      day: localDayKey(tx.date),
      recurring: tx.recurring || 'none',
      tags: tx.tags || []
    });
  }, [tx]);

  if (!tx || !form) return null;
  const isTransfer = txType(tx) === 'transfer';
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); setError(''); };
  const today = localDayKey(new Date());

  const remove = () => {
    const removed = actions.deleteTransaction(tx.id);
    onClose();
    notify('Entry deleted', { actionLabel: 'Undo', onAction: () => removed && actions.restoreTransaction(removed) });
  };

  const duplicate = () => {
    onClose();
    setTimeout(() => nav.openAdd({
      type: form.type,
      categoryId: form.categoryId,
      prefill: { amount: form.amount, description: form.description.replace(/^🔁\s*/, ''), tags: form.tags }
    }), 50);
  };

  const save = (e) => {
    e?.preventDefault();
    const amount = parseAmount(form.amount);
    const category = state.categories.find((c) => c.id === form.categoryId);
    if (!Number.isFinite(amount) || amount <= 0) return setError('Enter an amount above zero.');
    if (!category) return setError('Choose a budget.');
    const sameDay = localDayKey(tx.date) === form.day;
    actions.editTransaction({
      ...tx,
      type: form.type,
      amount: roundMoney(amount),
      categoryId: category.id,
      categoryName: category.name,
      description: form.description.trim() || (form.type === 'income' ? 'Income' : 'Expense'),
      date: sameDay ? tx.date : isoForDay(form.day, new Date(tx.date)),
      recurring: form.recurring,
      tags: form.tags
    });
    onClose();
    notify('Entry updated');
    return undefined;
  };

  if (isTransfer) {
    const from = state.categories.find((c) => c.id === tx.fromId);
    const to = state.categories.find((c) => c.id === tx.toId);
    return (
      <Sheet open onClose={onClose} title="Transfer" footer={<Button variant="danger-soft" className="w-full" onClick={remove}><Trash2 size={18} /> Delete transfer</Button>}>
        <div className="flex items-center gap-3 py-2">
          <span className="w-12 h-12 rounded-2xl bg-info-soft text-info flex items-center justify-center"><ArrowLeftRight size={22} /></span>
          <div>
            <p className="text-2xl font-semibold tabular">{money(tx.amount)}</p>
            <p className="text-sm text-muted">{formatDay(tx.date)} · {formatTime(tx.date)}</p>
          </div>
        </div>
        <p className="text-[15px] text-ink mt-2">{tx.description}</p>
        {(from || to) ? (
          <p className="text-sm text-muted mt-2">Deleting moves the money back from {to?.name || 'the destination'} to {from?.name || 'the source'}.</p>
        ) : (
          <p className="text-sm text-muted mt-2">This older transfer was recorded without amounts, so deleting it only removes it from history.</p>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit entry"
      footer={(
        <div className="flex gap-2.5">
          <Button variant="danger-soft" onClick={remove} aria-label="Delete entry"><Trash2 size={18} /></Button>
          <Button variant="secondary" onClick={duplicate} aria-label="Duplicate entry"><Copy size={18} /></Button>
          <Button className="flex-1" onClick={save}>Save changes</Button>
        </div>
      )}
    >
      <form onSubmit={save} className="space-y-5">
        <Segmented ariaLabel="Entry type" value={form.type} onChange={(type) => set({ type })} options={[{ value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }]} />
        <Field label="Amount">
          <MoneyInput symbol={money.symbol} value={form.amount} onChange={(e) => set({ amount: e.target.value })} inputClassName="text-xl font-semibold" />
        </Field>
        <div>
          <p className="text-[13px] font-medium text-muted mb-2">Budget</p>
          <CategoryPicker categories={categories} value={form.categoryId} onChange={(categoryId) => set({ categoryId })} />
          {!state.categories.some((c) => c.id === tx.categoryId) && (
            <p className="text-xs text-warn mt-2">The original budget “{tx.categoryName}” was deleted. Pick one to keep editing.</p>
          )}
        </div>
        <Field label="Note">
          <TextInput value={form.description} onChange={(e) => set({ description: e.target.value })} maxLength={80} />
        </Field>
        <Field label="Date">
          <TextInput type="date" value={form.day} max={today} onChange={(e) => set({ day: e.target.value || form.day })} />
        </Field>
        <div>
          <p className="text-[13px] font-medium text-muted mb-2">Repeat each cycle</p>
          <Segmented ariaLabel="Repeat" size="sm" value={tx.recurringSourceId ? 'none' : form.recurring} onChange={(recurring) => set({ recurring })}
            options={[{ value: 'none', label: 'Once' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
          {tx.recurringSourceId && <p className="text-xs text-subtle mt-2">This entry was created automatically from a repeating one.</p>}
        </div>
        {state.tags.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-muted mb-2">Tags</p>
            <div className="flex flex-wrap gap-2">
              {[...new Set([...state.tags, ...form.tags])].map((tag) => (
                <Chip key={tag} active={form.tags.includes(tag)} onClick={() => set({ tags: form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag] })}>#{tag}</Chip>
              ))}
            </div>
          </div>
        )}
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}
