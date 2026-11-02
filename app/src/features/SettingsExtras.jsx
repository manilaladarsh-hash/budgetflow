import { useMemo, useState } from 'react';
import { Upload, Trash2, Plus, Copy, Check, Smartphone, Wand2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { useFeedback } from '../ui/feedback.jsx';
import { quickAddTemplate } from '../lib/quickadd.js';
import { Card, SectionHeader, Button, Sheet, TextInput, Field, IconButton, Segmented, EmptyState } from '../ui/primitives.jsx';
import { CategoryBadge, CategoryPicker, useSortedCategories } from './shared.jsx';

const pretty = (key) => key.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

export function ImportSection() {
  const { state, actions } = useStore();
  const nav = useNav();
  const { notify, ask } = useFeedback();
  const categories = useSortedCategories();
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ match: '', categoryId: '', action: 'categorize' });
  const rules = useMemo(() => [...state.importRules].sort((a, b) => (b.mode === 'contains') - (a.mode === 'contains') || String(a.match).localeCompare(String(b.match))), [state.importRules]);
  const shown = showAll ? rules : rules.slice(0, 8);

  const saveRule = () => {
    const match = draft.match.trim().toUpperCase();
    if (match.length < 2) { notify('Type at least 2 letters to match', { tone: 'bad' }); return; }
    if (draft.action === 'categorize' && !draft.categoryId) { notify('Pick a budget for this rule', { tone: 'bad' }); return; }
    actions.setRules([
      ...state.importRules.filter((r) => !(r.mode === 'contains' && r.match === match)),
      { id: `r${Date.now().toString(36)}`, match, mode: 'contains', categoryId: draft.action === 'skip' ? null : draft.categoryId, action: draft.action, hits: 0, updatedAt: new Date().toISOString() }
    ]);
    setAdding(false);
    setDraft({ match: '', categoryId: '', action: 'categorize' });
    notify('Rule added');
  };

  const clearAll = async () => {
    const ok = await ask({ title: 'Forget all rules?', message: 'BudgetFlow will go back to guessing budgets for every merchant. Entries already added are not changed.', confirmLabel: 'Forget all', destructive: true });
    if (ok) actions.setRules([]);
  };

  return (
    <section>
      <SectionHeader title="Bank & card import" />
      <Card className="p-4 space-y-3">
        <p className="text-sm text-muted">Download CSV or QFX files from your banks and cards and import them together. Duplicates and card payments are skipped automatically.</p>
        <Button className="w-full" onClick={() => nav.go('import')}><Upload size={17} /> Import statements</Button>
      </Card>
      <div className="flex items-center justify-between px-1 mt-5 mb-2.5">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-subtle">Auto-sort rules ({rules.length})</h3>
        <Button size="sm" variant="soft" onClick={() => setAdding(true)}><Plus size={16} /> Rule</Button>
      </div>
      <Card className="divide-y divide-[var(--border)] overflow-hidden">
        {rules.length === 0 ? (
          <EmptyState icon={<Wand2 size={22} />} title="No rules yet" body="Rules are learned as you import. Pick a budget for a merchant once and it's sorted automatically after that." />
        ) : shown.map((r) => {
          const cat = state.categories.find((c) => c.id === r.categoryId);
          return (
            <div key={r.id} className="flex items-center gap-3 pl-4 pr-2 py-2.5 min-h-[56px]">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium truncate">{r.mode === 'contains' ? `Contains “${r.match}”` : pretty(r.match)}</p>
                <p className="text-[13px] text-muted truncate flex items-center gap-1.5">
                  {r.action === 'skip' ? 'Always skip' : cat ? <><CategoryBadge category={cat} size={16} iconSize={10} /> {cat.name}</> : 'Budget was deleted'}
                </p>
              </div>
              <IconButton label={`Delete rule ${r.match}`} size={40} onClick={() => actions.setRules(state.importRules.filter((x) => x.id !== r.id))}><Trash2 size={17} /></IconButton>
            </div>
          );
        })}
        {rules.length > 8 && (
          <button type="button" className="w-full h-11 text-sm font-medium text-accent-strong" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Show fewer' : `Show all ${rules.length}`}</button>
        )}
      </Card>
      {rules.length > 0 && <button type="button" onClick={clearAll} className="text-xs text-subtle underline px-1 mt-2">Forget all rules</button>}

      <Sheet open={adding} onClose={() => setAdding(false)} title="New rule" footer={<Button className="w-full" onClick={saveRule}>Save rule</Button>}>
        <div className="space-y-4">
          <Field label="When the description contains" hint="Not case-sensitive. Example: “E-TRANSFER TO J SMITH” or “PRESTO”.">
            <TextInput value={draft.match} onChange={(e) => setDraft((d) => ({ ...d, match: e.target.value }))} placeholder="Text to look for" data-autofocus />
          </Field>
          <Segmented ariaLabel="Then" value={draft.action} onChange={(action) => setDraft((d) => ({ ...d, action }))} options={[{ value: 'categorize', label: 'Put in a budget' }, { value: 'skip', label: 'Always skip' }]} />
          {draft.action === 'categorize' && <CategoryPicker categories={categories} value={draft.categoryId} onChange={(categoryId) => setDraft((d) => ({ ...d, categoryId }))} showBalance={false} />}
        </div>
      </Sheet>
    </section>
  );
}

export function ApplePaySection() {
  const nav = useNav();
  const { notify } = useFeedback();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const base = `${window.location.origin}${window.location.pathname}`;
  const template = quickAddTemplate(base);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(template);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify('Copy failed. Select the link and copy it manually.', { tone: 'bad' });
    }
  };

  return (
    <section>
      <SectionHeader title="Apple Pay auto-log (iPhone)" />
      <Card className="p-4 space-y-3">
        <div className="flex gap-3">
          <span className="w-10 h-10 rounded-2xl bg-info-soft text-info flex items-center justify-center shrink-0"><Smartphone size={19} /></span>
          <p className="text-sm text-muted">Every time you pay with Apple Pay, your iPhone can send the amount and merchant straight to BudgetFlow, sorted into the right budget. Set it up once with the Shortcuts app (iOS 17 or later).</p>
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between h-10 font-medium" aria-expanded={open}>
          Set-up steps {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
        {open && (
          <div className="space-y-4 text-sm text-muted leading-relaxed">
            <ol className="list-decimal pl-5 space-y-2">
              <li>Open <b className="text-ink">Shortcuts</b> → <b className="text-ink">Automation</b> tab → <b className="text-ink">+</b> → choose <b className="text-ink">Transaction</b>.</li>
              <li>Select the cards you pay with (leave merchants and categories as <i>Any</i>), choose <b className="text-ink">Run Immediately</b>, then <b className="text-ink">Next</b> → <b className="text-ink">New Blank Automation</b>.</li>
              <li>Add the action <b className="text-ink">URL Encode</b>. Tap its input, choose <b className="text-ink">Shortcut Input</b>, then tap that and pick <b className="text-ink">Merchant</b>.</li>
              <li>Add the action <b className="text-ink">Text</b> and paste the link below. Then swap the placeholders:
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  <li><code className="text-ink">AMOUNT</code> → Shortcut Input › <b className="text-ink">Amount</b></li>
                  <li><code className="text-ink">MERCHANT</code> → <b className="text-ink">URL Encoded Text</b></li>
                  <li><code className="text-ink">CARD</code> → Shortcut Input › <b className="text-ink">Card</b> run through a second <b className="text-ink">URL Encode</b> (or simply delete <code>&amp;card=CARD</code>)</li>
                </ul>
              </li>
              <li>Add the action <b className="text-ink">Open URLs</b> (it uses the Text automatically). Tap <b className="text-ink">Done</b>.</li>
            </ol>
            <div className="rounded-2xl bg-surface-2 border border-line p-3">
              <code className="block text-xs text-ink break-all select-all" data-testid="quickadd-template">{template}</code>
              <Button size="sm" variant="secondary" className="mt-2" onClick={copy}>{copied ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy link</>}</Button>
            </div>
            <div className="flex gap-2 rounded-2xl bg-warn-soft p-3 text-[13px]">
              <Info size={16} className="text-warn shrink-0 mt-0.5" />
              <p className="text-ink">Links from Shortcuts open in <b>Safari</b>, and an iPhone keeps a Home Screen web app's data separate from Safari. Use BudgetFlow in Safari (bookmark it) so Apple Pay entries land in the same place as everything else.</p>
            </div>
            <p>Purchases from merchants BudgetFlow knows are logged instantly; for new ones it opens a ready-filled entry so you just pick the budget. It learns from that. If you also import that card's statement later, Apple Pay entries are recognised and not added twice.</p>
            <p className="text-xs text-subtle">Menu names can differ slightly between iOS versions.</p>
          </div>
        )}
        <Button variant="secondary" className="w-full" onClick={() => nav.go('add?amount=4.50&merchant=Test%20Coffee%20Shop')}>Try a test entry</Button>
      </Card>
    </section>
  );
}
