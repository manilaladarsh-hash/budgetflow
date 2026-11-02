import { useMemo, useState } from 'react';
import { Search, X, SlidersHorizontal, Download, Receipt, Upload } from 'lucide-react';
import { useStore } from '../state/store.jsx';
import { useNav } from '../state/nav.js';
import { localDayKey, relativeDayLabel } from '../lib/dates.js';
import { txType, isSpending, isIncome } from '../lib/transactions.js';
import { transactionsToCsv, downloadFile } from '../lib/backup.js';
import { Card, Chip, EmptyState, Sheet, Button, Field, TextInput, Segmented, IconButton, cx } from '../ui/primitives.jsx';
import { TxRow, useMoney, useSortedCategories, CategoryPicker } from './shared.jsx';

const PAGE = 60;
const emptyFilters = { type: 'all', categoryId: '', account: '', tags: [], from: '', to: '', showSystem: false };

export default function Activity() {
  const { state } = useStore();
  const nav = useNav();
  const money = useMoney();
  const categories = useSortedCategories();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(emptyFilters);
  const [filterOpen, setFilterOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.transactions.filter((t) => {
      const type = txType(t);
      if (type === 'system' && !filters.showSystem) return false;
      if (filters.type !== 'all' && type !== filters.type) return false;
      if (filters.categoryId && t.categoryId !== filters.categoryId && t.fromId !== filters.categoryId && t.toId !== filters.categoryId) return false;
      if (filters.account && t.account !== filters.account) return false;
      const day = localDayKey(t.date);
      if (filters.from && day < filters.from) return false;
      if (filters.to && day > filters.to) return false;
      if (filters.tags.length && !filters.tags.every((tag) => (t.tags || []).includes(tag))) return false;
      if (q) {
        const hay = `${t.description || ''} ${t.categoryName || ''} ${(t.tags || []).join(' ')} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [state.transactions, query, filters]);

  const totals = useMemo(() => ({
    spent: filtered.filter(isSpending).reduce((s, t) => s + (Number(t.amount) || 0), 0),
    income: filtered.filter(isIncome).reduce((s, t) => s + (Number(t.amount) || 0), 0)
  }), [filtered]);

  const groups = useMemo(() => {
    const out = [];
    filtered.slice(0, limit).forEach((t) => {
      const key = localDayKey(t.date);
      let g = out[out.length - 1];
      if (!g || g.key !== key) { g = { key, items: [], net: 0 }; out.push(g); }
      g.items.push(t);
      if (isSpending(t)) g.net -= Number(t.amount) || 0;
      if (isIncome(t)) g.net += Number(t.amount) || 0;
    });
    return out;
  }, [filtered, limit]);

  const accounts = useMemo(() => [...new Set(state.transactions.map((t) => t.account).filter(Boolean))].sort(), [state.transactions]);
  const activeCount = (filters.type !== 'all') + !!filters.categoryId + !!filters.account + filters.tags.length + !!filters.from + !!filters.to + filters.showSystem;
  const activeCategory = categories.find((c) => c.id === filters.categoryId);
  const exportCsv = () => downloadFile(`budgetflow-${localDayKey()}.csv`, transactionsToCsv(filtered), 'text/csv;charset=utf-8');

  return (
    <div className="space-y-4 pt-2">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }}
            placeholder="Search notes, budgets, tags"
            aria-label="Search activity"
            className="w-full h-11 pl-10 pr-10 rounded-2xl bg-surface border border-line outline-none focus:border-accent text-ink placeholder:text-subtle"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full inline-flex items-center justify-center text-subtle hover:text-ink"><X size={16} /></button>
          )}
        </div>
        <IconButton label="Filters" variant="secondary" onClick={() => setFilterOpen(true)} className="rounded-2xl relative">
          <SlidersHorizontal size={18} />
          {activeCount > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-accent text-accent-fg text-[11px] font-semibold inline-flex items-center justify-center">{activeCount}</span>}
        </IconButton>
        <IconButton label="Import statements" variant="secondary" onClick={() => nav.go('import')} className="rounded-2xl"><Upload size={18} /></IconButton>
        <IconButton label="Export as CSV" variant="secondary" onClick={exportCsv} className="rounded-2xl hidden sm:inline-flex"><Download size={18} /></IconButton>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {[['all', 'All'], ['expense', 'Expenses'], ['income', 'Income'], ['transfer', 'Transfers']].map(([v, l]) => (
          <Chip key={v} active={filters.type === v} onClick={() => setFilters((f) => ({ ...f, type: v }))}>{l}</Chip>
        ))}
        {filters.account && <Chip active onClick={() => setFilters((f) => ({ ...f, account: '' }))}>{filters.account} <X size={14} /></Chip>}
        {activeCategory && <Chip active onClick={() => setFilters((f) => ({ ...f, categoryId: '' }))}>{activeCategory.name} <X size={14} /></Chip>}
        {filters.tags.map((tag) => <Chip key={tag} active onClick={() => setFilters((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }))}>#{tag} <X size={14} /></Chip>)}
        {(filters.from || filters.to) && <Chip active onClick={() => setFilters((f) => ({ ...f, from: '', to: '' }))}>{filters.from || '…'} → {filters.to || '…'} <X size={14} /></Chip>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-surface border border-line px-3.5 py-2.5"><p className="text-xs text-muted">Entries</p><p className="font-semibold tabular">{filtered.length}</p></div>
        <div className="rounded-2xl bg-surface border border-line px-3.5 py-2.5"><p className="text-xs text-muted">Spent</p><p className="font-semibold tabular truncate">{money(Math.round(totals.spent))}</p></div>
        <div className="rounded-2xl bg-surface border border-line px-3.5 py-2.5"><p className="text-xs text-muted">Income</p><p className="font-semibold tabular text-accent-strong truncate">{money(Math.round(totals.income))}</p></div>
      </div>

      {groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt size={22} />}
            title={state.transactions.length ? 'No matches' : 'No activity yet'}
            body={state.transactions.length ? 'Try a different search or clear the filters.' : 'Entries you add will show up here, grouped by day.'}
            action={state.transactions.length
              ? <Button size="sm" variant="secondary" onClick={() => { setQuery(''); setFilters(emptyFilters); }}>Clear all</Button>
              : <Button size="sm" onClick={() => nav.openAdd({ type: 'expense' })}>Add an entry</Button>}
          />
        </Card>
      ) : groups.map((g) => (
        <section key={g.key}>
          <div className="flex items-center justify-between px-1 mb-2">
            <h2 className="text-[13px] font-semibold text-muted">{relativeDayLabel(g.key)}</h2>
            {g.net !== 0 && <span className={cx('text-[13px] font-medium tabular', g.net > 0 ? 'text-accent-strong' : 'text-muted')}>{money(Math.round(g.net * 100) / 100, { signed: true })}</span>}
          </div>
          <Card className="divide-y divide-[var(--border)] overflow-hidden">
            {g.items.map((t) => <TxRow key={t.id} tx={t} onClick={() => nav.openTransaction(t)} />)}
          </Card>
        </section>
      ))}

      {filtered.length > limit && (
        <Button variant="secondary" className="w-full" onClick={() => setLimit((l) => l + PAGE)}>Show more ({filtered.length - limit} left)</Button>
      )}

      <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} filters={filters} setFilters={setFilters} categories={categories} tags={state.tags} accounts={accounts} onExport={exportCsv} />
    </div>
  );
}

function FilterSheet({ open, onClose, filters, setFilters, categories, tags, accounts, onExport }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Filters"
      footer={(
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setFilters(emptyFilters)}>Reset</Button>
          <Button onClick={onClose}>Show results</Button>
        </div>
      )}
    >
      <div className="space-y-5">
        <Segmented ariaLabel="Type" value={filters.type} onChange={(type) => set({ type })}
          options={[{ value: 'all', label: 'All' }, { value: 'expense', label: 'Expense' }, { value: 'income', label: 'Income' }, { value: 'transfer', label: 'Move' }]} />
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[13px] font-medium text-muted">Budget</p>
            {filters.categoryId && <button type="button" className="text-sm text-accent-strong h-8 px-2" onClick={() => set({ categoryId: '' })}>Any budget</button>}
          </div>
          <CategoryPicker categories={categories} value={filters.categoryId} onChange={(categoryId) => set({ categoryId: categoryId === filters.categoryId ? '' : categoryId })} showBalance={false} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><TextInput type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} /></Field>
          <Field label="To"><TextInput type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} /></Field>
        </div>
        {tags.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-muted mb-2">Tags (all must match)</p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Chip key={tag} active={filters.tags.includes(tag)} onClick={() => set({ tags: filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag] })}>#{tag}</Chip>
              ))}
            </div>
          </div>
        )}
        {accounts.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-muted mb-2">Card / account</p>
            <div className="flex flex-wrap gap-2">
              {accounts.map((a) => <Chip key={a} active={filters.account === a} onClick={() => set({ account: filters.account === a ? '' : a })}>{a}</Chip>)}
            </div>
          </div>
        )}
        <Chip active={filters.showSystem} onClick={() => set({ showSystem: !filters.showSystem })}>Show cycle renewals</Chip>
        <Button variant="secondary" className="w-full sm:hidden" onClick={onExport}><Download size={17} /> Export these as CSV</Button>
      </div>
    </Sheet>
  );
}
