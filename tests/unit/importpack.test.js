import { describe, it, expect } from 'vitest';
import { encodePack, decodePack, applyPack } from '../../app/src/lib/importpack.js';
import { normalizeState, INITIAL_CATEGORIES } from '../../app/src/lib/storage.js';
import { addTransactions, buildTransaction } from '../../app/src/lib/transactions.js';

const pack = {
  v: 1,
  label: 'test statements',
  accounts: ['Test card'],
  budgets: [
    { name: 'Grocery', concept: 'grocery', icon: 'apple', frequency: 'weekly', limit: 50 },
    { name: 'Eating out', concept: 'dining', icon: 'utensils', frequency: 'weekly', limit: 20 },
    { name: 'Subscriptions', concept: 'subscriptions', icon: 'tv', frequency: 'monthly', limit: 30 }
  ],
  entries: [
    ['2026-10-02', 12.5, 'o', 'Fortinos', 'FORTINOS HAMILTON', 0, 0, 'test-card|2026-10-02|12.50|out|FORTINOS|1', 'FORTINOS'],
    ['2026-10-03', 20.87, 'o', 'DoorDash', 'DD/DOORDASH', 0, 1, 'test-card|2026-10-03|20.87|out|DOORDASH|1', 'DOORDASH'],
    ['2026-10-04', 8, 'o', 'Google', 'GOOGLE *SERVICES', 0, 2, 'test-card|2026-10-04|8.00|out|GOOGLE|1', 'GOOGLE'],
    ['2026-11-03', 5, 'o', 'Fortinos', 'FORTINOS HAMILTON', 0, 0, 'test-card|2026-11-03|5.00|out|FORTINOS|1', 'FORTINOS']
  ],
  rules: [['DOORDASH', 1]]
};
const fresh = () => normalizeState({ categories: INITIAL_CATEGORIES, transactions: [], cycleStartDate: new Date(2026, 10, 1).toISOString() });

describe('import packs', () => {
  it('round-trips through a link-safe code', async () => {
    const code = await encodePack(pack);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(await decodePack(`https://x.test/#/import?pack=${code}`)).toEqual(pack);
    await expect(decodePack('nonsense!!')).rejects.toThrow();
  });
  it('maps budgets by name, creates missing ones (not merging subscriptions into shopping)', () => {
    const r = applyPack(fresh(), pack, 'b1');
    expect(r.createdBudgets).toEqual(['Eating out', 'Subscriptions']);
    const after = addTransactions(r.state, r.transactions);
    expect(after.transactions).toHaveLength(4);
    expect(after.transactions.find((t) => t.description === 'Google').categoryName).toBe('Subscriptions');
    // Before the current cycle: history only. After: counts against the budget.
    expect(after.categories.find((c) => c.name === 'Grocery').balance).toBe(65);
    expect(after.importRules.some((x) => x.match === 'DOORDASH')).toBe(true);
  });
  it('is safe to open twice and skips entries already typed in', () => {
    let s = fresh();
    s = addTransactions(s, [buildTransaction({ type: 'expense', amount: 20.87, description: 'Dinner', category: s.categories[1], date: new Date(2026, 9, 2, 19).toISOString() })]);
    const r1 = applyPack(s, pack, 'b1');
    expect(r1.added).toBe(3);
    const s2 = addTransactions(r1.state, r1.transactions);
    const r2 = applyPack(s2, pack, 'b2');
    expect(r2.added).toBe(0);
  });
});
