import { useRef, useState } from 'react';
import { Plus, ChevronUp, ChevronDown, Pencil, Download, Upload, FileSpreadsheet, Printer, Trash2, Eye, EyeOff, X, Sun, Moon, Monitor, ExternalLink } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { useFeedback } from '../ui/feedback.jsx';
import { CURRENCIES, parseAmount, roundMoney } from '../lib/money.js';
import { GEMINI_MODELS } from '../lib/storage.js';
import { createBackup, parseBackup, transactionsToCsv, downloadFile } from '../lib/backup.js';
import { localDayKey } from '../lib/dates.js';
import { Card, SectionHeader, Field, TextInput, MoneyInput, Segmented, Toggle, Button, Chip, IconButton, cx } from '../ui/primitives.jsx';
import { CategoryBadge, useMoney, useSortedCategories } from './shared.jsx';
import CategoryEditor from './CategoryEditor.jsx';

const SYNC_TEXT = {
  synced: 'Backed up to the cloud for this browser.',
  connecting: 'Connecting…',
  offline: 'Offline right now. Everything is saved on this device and syncs when you reconnect.',
  error: 'The last cloud save failed. Your data is still saved on this device.',
  off: 'Data stays only on this device.'
};

export default function Settings() {
  const { state, actions, syncStatus } = useStore();
  const nav = useNav();
  const { notify, ask } = useFeedback();
  const money = useMoney();
  const categories = useSortedCategories();
  const [editing, setEditing] = useState(undefined);
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState(state.prefs.geminiKey);
  const [tagDraft, setTagDraft] = useState('');
  const [limits, setLimits] = useState({ daily: state.prefs.dailyLimit ? String(state.prefs.dailyLimit) : '', alert: state.prefs.alertThreshold ? String(state.prefs.alertThreshold) : '' });
  const fileRef = useRef(null);

  const saveLimits = () => {
    const daily = limits.daily.trim() ? parseAmount(limits.daily) : 0;
    const alert = limits.alert.trim() ? parseAmount(limits.alert) : 0;
    if (!Number.isFinite(daily) || daily < 0 || !Number.isFinite(alert) || alert < 0) { notify('Limits must be positive numbers', { tone: 'bad' }); return; }
    actions.setPrefs({ dailyLimit: roundMoney(daily), alertThreshold: roundMoney(alert) });
    notify('Limits saved');
  };

  const addTag = () => {
    const tag = tagDraft.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    if (!tag || state.tags.includes(tag)) { setTagDraft(''); return; }
    actions.setTags([...state.tags, tag]);
    setTagDraft('');
  };

  const backup = () => {
    downloadFile(`budgetflow-backup-${localDayKey()}.json`, JSON.stringify(createBackup(state), null, 2), 'application/json');
    notify('Backup downloaded');
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const restored = parseBackup(text, state);
      const ok = await ask({
        title: 'Restore this backup?',
        message: `This replaces what's in the app now with ${restored.transactions.length} entries and ${restored.categories.length} budgets from the file. Download a backup of the current data first if you might need it.`,
        confirmLabel: 'Restore',
        destructive: true
      });
      if (!ok) return;
      actions.restoreBackup(restored);
      notify('Backup restored');
      nav.go('home');
    } catch (err) {
      notify(err.message || 'That backup could not be read', { tone: 'bad' });
    }
  };

  const reset = async () => {
    const ok = await ask({
      title: 'Erase everything?',
      message: 'All budgets, entries, goals, bills and settings on this device are deleted, and the cloud copy is cleared. This cannot be undone.',
      confirmLabel: 'Erase all data',
      destructive: true,
      typeToConfirm: 'ERASE'
    });
    if (!ok) return;
    actions.resetAll();
    nav.go('home');
  };

  return (
    <div className="space-y-7 pt-2">
      <section>
        <SectionHeader title="Profile" />
        <Card className="p-4 space-y-4">
          <Field label="Your name">
            <TextInput value={state.prefs.name} onChange={(e) => actions.setPrefs({ name: e.target.value.slice(0, 30) })} placeholder="Optional" />
          </Field>
          <div>
            <p className="text-[13px] font-medium text-muted mb-2">Currency</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Currency">
              {CURRENCIES.map((c) => (
                <Chip key={c} role="radio" aria-checked={state.prefs.currency === c} active={state.prefs.currency === c} onClick={() => actions.setPrefs({ currency: c })} className="min-w-12 justify-center">{c}</Chip>
              ))}
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Appearance" />
        <Card className="p-4">
          <Segmented
            ariaLabel="Theme"
            value={state.prefs.theme}
            onChange={(theme) => actions.setPrefs({ theme })}
            options={[
              { value: 'system', label: 'Auto', icon: <Monitor size={16} /> },
              { value: 'light', label: 'Light', icon: <Sun size={16} /> },
              { value: 'dark', label: 'Dark', icon: <Moon size={16} /> }
            ]}
          />
        </Card>
      </section>

      <section id="categories">
        <SectionHeader title="Budgets" action={<Button size="sm" variant="soft" onClick={() => setEditing(null)}><Plus size={16} /> New</Button>} />
        <Card className="divide-y divide-[var(--border)] overflow-hidden">
          {categories.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 pl-4 pr-2 py-2.5 min-h-[60px]">
              <CategoryBadge category={c} size={36} iconSize={18} />
              <button type="button" onClick={() => setEditing(c)} className="flex-1 min-w-0 text-left px-1">
                <span className="block text-[15px] font-medium truncate">{c.name}</span>
                <span className="block text-[13px] text-muted tabular">{money(c.limit)} {c.frequency}{c.pinned ? ' · pinned' : ''}</span>
              </button>
              <IconButton label={`Move ${c.name} up`} size={36} disabled={i === 0 || c.pinned} onClick={() => actions.moveCategory(c.id, -1)} className="disabled:opacity-25"><ChevronUp size={18} /></IconButton>
              <IconButton label={`Move ${c.name} down`} size={36} disabled={i === categories.length - 1 || c.pinned} onClick={() => actions.moveCategory(c.id, 1)} className="disabled:opacity-25"><ChevronDown size={18} /></IconButton>
              <IconButton label={`Edit ${c.name}`} size={36} onClick={() => setEditing(c)}><Pencil size={16} /></IconButton>
            </div>
          ))}
          {categories.length === 0 && <p className="px-4 py-4 text-sm text-muted">No budgets yet.</p>}
        </Card>
        <p className="text-xs text-subtle px-1 mt-2">Weekly budgets refill every Sunday; monthly ones on the first cycle of each month. <button type="button" className="underline" onClick={nav.openCycle}>How cycles work</button></p>
      </section>

      <section>
        <SectionHeader title="Spending guards" />
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Daily limit" hint="Warns before you go over">
              <MoneyInput symbol={money.symbol} value={limits.daily} onChange={(e) => setLimits((l) => ({ ...l, daily: e.target.value }))} placeholder="Off" />
            </Field>
            <Field label="Large expense alert" hint="Asks to confirm above this">
              <MoneyInput symbol={money.symbol} value={limits.alert} onChange={(e) => setLimits((l) => ({ ...l, alert: e.target.value }))} placeholder="Off" />
            </Field>
          </div>
          <Button variant="secondary" size="sm" onClick={saveLimits}>Save limits</Button>
        </Card>
      </section>

      <section>
        <SectionHeader title="Tags" />
        <Card className="p-4">
          <div className="flex flex-wrap gap-2">
            {state.tags.map((t) => (
              <span key={t} className="inline-flex items-center h-9 pl-3.5 pr-1 rounded-full border border-line text-sm text-muted">
                #{t}
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => actions.setTags(state.tags.filter((x) => x !== t))} className="w-7 h-7 ml-0.5 rounded-full inline-flex items-center justify-center hover:text-danger"><X size={14} /></button>
              </span>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <TextInput value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }} placeholder="New tag" aria-label="New tag" />
            <Button variant="secondary" onClick={addTag}>Add</Button>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="AI assistant (optional)" />
        <Card className="p-4 space-y-4">
          <p className="text-sm text-muted">Gemini can read receipts, turn a sentence into an entry, and answer questions about your spending. Your key stays in this browser and is only sent to Google.</p>
          <Field label="Gemini API key">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <TextInput type={showKey ? 'text' : 'password'} value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder="Paste your key" autoComplete="off" spellCheck={false} className="pr-11" />
                <button type="button" aria-label={showKey ? 'Hide key' : 'Show key'} onClick={() => setShowKey((s) => !s)} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full inline-flex items-center justify-center text-subtle hover:text-ink">{showKey ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
              <Button variant="secondary" onClick={() => { actions.setPrefs({ geminiKey: keyDraft.trim() }); notify(keyDraft.trim() ? 'Key saved' : 'Key removed'); }} disabled={keyDraft.trim() === state.prefs.geminiKey}>Save</Button>
            </div>
          </Field>
          <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong">Get a free key <ExternalLink size={14} /></a>
          <div>
            <p className="text-[13px] font-medium text-muted mb-2">Model</p>
            <div className="grid gap-2" role="radiogroup" aria-label="Model">
              {GEMINI_MODELS.map((m) => {
                const active = state.prefs.aiModel === m.id;
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={active} onClick={() => actions.setPrefs({ aiModel: m.id })}
                    className={cx('flex items-center justify-between h-12 px-4 rounded-2xl border text-left transition', active ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2')}>
                    <span className="text-[15px] font-medium">{m.label}</span>
                    <span className="text-xs text-muted">{m.note}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title="Sync & data" />
        <Card className="p-4 space-y-4">
          <Toggle
            checked={state.prefs.cloudSync}
            onChange={(cloudSync) => actions.setPrefs({ cloudSync })}
            label="Cloud backup"
            description={SYNC_TEXT[syncStatus] || SYNC_TEXT.off}
          />
          <p className="text-xs text-subtle">Cloud backup uses an anonymous account tied to this browser. To move to another device, download a backup and restore it there.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button variant="secondary" onClick={backup}><Download size={17} /> Backup</Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={17} /> Restore</Button>
            <Button variant="secondary" onClick={() => downloadFile(`budgetflow-${localDayKey()}.csv`, transactionsToCsv(state.transactions), 'text/csv;charset=utf-8')}><FileSpreadsheet size={17} /> Export CSV</Button>
            <Button variant="secondary" onClick={() => window.print()}><Printer size={17} /> Print</Button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={restore} />
        </Card>
      </section>

      <section>
        <SectionHeader title="Danger zone" />
        <Card className="p-4">
          <Button variant="danger-soft" className="w-full" onClick={reset}><Trash2 size={17} /> Erase all data</Button>
        </Card>
      </section>

      <p className="text-center text-xs text-subtle pb-4">BudgetFlow 4.0 · data saved on this device</p>

      <CategoryEditor open={editing !== undefined} category={editing || null} onClose={() => setEditing(undefined)} onDeleted={() => setEditing(undefined)} />
    </div>
  );
}
