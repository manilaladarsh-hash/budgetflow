import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useFeedback } from '../ui/feedback.jsx';
import { parseAmount } from '../lib/money.js';
import { Sheet, Field, TextInput, MoneyInput, Segmented, Button, cx } from '../ui/primitives.jsx';
import { CatIcon, CATEGORY_ICON_CHOICES, PALETTE, PALETTE_CHOICES, tintFor } from '../ui/icons.jsx';
import { useMoney } from './shared.jsx';

const empty = { name: '', limit: '', balance: '', frequency: 'weekly', icon: 'shopping-bag', color: 'emerald' };

export default function CategoryEditor({ open, category, onClose, onDeleted }) {
  const { actions } = useStore();
  const { notify, ask } = useFeedback();
  const money = useMoney();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const isNew = !category;

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(category ? {
      name: category.name,
      limit: String(category.limit),
      balance: String(category.balance),
      frequency: category.frequency,
      icon: category.icon,
      color: category.color
    } : empty);
  }, [open, category]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const tint = tintFor({ ...category, color: form.color, id: category?.id || form.name });

  const save = (e) => {
    e?.preventDefault();
    const name = form.name.trim();
    const limit = parseAmount(form.limit);
    const balance = isNew ? limit : parseAmount(form.balance);
    if (!name) return setError('Give the budget a name.');
    if (!Number.isFinite(limit) || limit < 0) return setError('Enter a budget amount.');
    if (!Number.isFinite(balance)) return setError('Enter the amount left.');
    if (isNew) {
      actions.addCategory({ name, limit, balance, frequency: form.frequency, icon: form.icon, color: form.color });
      notify(`${name} budget added`);
    } else {
      actions.updateCategory(category.id, { name, limit, balance, frequency: form.frequency, icon: form.icon, color: form.color });
      notify(`${name} updated`);
    }
    onClose();
  };

  const remove = async () => {
    const ok = await ask({
      title: `Delete ${category.name}?`,
      message: 'The budget is removed. Its past transactions stay in your history.',
      confirmLabel: 'Delete',
      destructive: true
    });
    if (!ok) return;
    actions.deleteCategory(category.id);
    notify(`${category.name} deleted`);
    onDeleted?.();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isNew ? 'New budget' : 'Edit budget'}
      footer={(
        <div className="flex gap-3">
          {!isNew && <Button variant="danger-soft" onClick={remove} aria-label="Delete budget"><Trash2 size={18} /></Button>}
          <Button className="flex-1" onClick={save}>{isNew ? 'Create budget' : 'Save changes'}</Button>
        </div>
      )}
    >
      <form onSubmit={save} className="space-y-4">
        <Field label="Name">
          <TextInput value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Groceries" maxLength={40} data-autofocus={isNew ? true : undefined} />
        </Field>
        <Segmented
          ariaLabel="Resets"
          value={form.frequency}
          onChange={(frequency) => set({ frequency })}
          options={[{ value: 'weekly', label: 'Resets weekly' }, { value: 'monthly', label: 'Resets monthly' }]}
        />
        <div className={cx('grid gap-3', isNew ? 'grid-cols-1' : 'grid-cols-2')}>
          <Field label={form.frequency === 'monthly' ? 'Monthly budget' : 'Weekly budget'}>
            <MoneyInput symbol={money.symbol} value={form.limit} onChange={(e) => set({ limit: e.target.value })} placeholder="0" />
          </Field>
          {!isNew && (
            <Field label="Left right now">
              <MoneyInput symbol={money.symbol} value={form.balance} onChange={(e) => set({ balance: e.target.value })} placeholder="0" />
            </Field>
          )}
        </div>
        <div>
          <p className="text-[13px] font-medium text-muted mb-2">Colour</p>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Colour">
            {PALETTE_CHOICES.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.color === k}
                aria-label={k}
                onClick={() => set({ color: k })}
                className="w-9 h-9 rounded-full transition"
                style={{ background: PALETTE[k], boxShadow: form.color === k ? `0 0 0 3px var(--surface), 0 0 0 5px ${PALETTE[k]}` : 'none' }}
              />
            ))}
          </div>
        </div>
        <div>
          <p className="text-[13px] font-medium text-muted mb-2">Icon</p>
          <div className="grid grid-cols-6 gap-2" role="radiogroup" aria-label="Icon">
            {CATEGORY_ICON_CHOICES.map((name) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={form.icon === name}
                aria-label={name}
                onClick={() => set({ icon: name })}
                className={cx('h-11 rounded-2xl flex items-center justify-center border transition', form.icon === name ? 'border-transparent' : 'border-line text-muted hover:text-ink')}
                style={form.icon === name ? { background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint, boxShadow: `inset 0 0 0 1.5px ${tint}` } : undefined}
              >
                <CatIcon name={name} size={20} />
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" hidden aria-hidden="true" />
      </form>
    </Sheet>
  );
}
