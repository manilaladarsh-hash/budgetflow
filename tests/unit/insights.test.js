import { describe, it, expect } from 'vitest';
import { cashFlow, merchantSpending, accountSpending, spendingEntries, merchantMatcher } from '../../app/src/lib/analytics.js';

const month = new Date(2026, 10, 15, 12);
const d = (day, h = 12) => new Date(2026, 10, day, h).toISOString();
const txs = [
  { id: 1, type: 'expense', amount: 4.5, description: 'Tim Hortons', categoryId: 'c', date: d(2), account: 'Neo' },
  { id: 2, type: 'expense', amount: 5.5, description: 'tim  hortons', categoryId: 'c', date: d(3), account: 'Neo' },
  { id: 3, type: 'expense', amount: 90, description: 'Costco', categoryId: 'g', date: d(4), account: 'BMO Mastercard' },
  { id: 4, type: 'expense', amount: 20, description: 'Lunch', categoryId: 'g', date: d(5) },
  { id: 5, type: 'income', amount: 1000, description: 'Payroll', categoryId: 'income', date: d(6) },
  { id: 6, type: 'income', amount: 10, description: 'Refund', categoryId: 'g', date: d(7) },
  { id: 7, type: 'transfer', amount: 50, description: 'Move', categoryId: 'system', date: d(8) },
  { id: 8, type: 'expense', amount: 999, description: 'Old', categoryId: 'g', date: new Date(2026, 9, 30, 12).toISOString() }
];

describe('money story analytics', () => {
  it('splits money in into income and refunds and ignores transfers and other months', () => {
    const f = cashFlow(txs, month);
    expect(f).toMatchObject({ income: 1000, refunds: 10, spent: 120, net: 890, count: 4 });
    expect(f.savingsRate).toBeCloseTo(89);
    expect(cashFlow([], month).savingsRate).toBeNull();
  });

  it('groups merchants case- and space-insensitively, biggest first', () => {
    const m = merchantSpending(txs, month);
    expect(m[0]).toMatchObject({ name: 'Costco', amount: 90, count: 1 });
    const tim = m.find((x) => x.key === 'tim hortons');
    expect(tim).toMatchObject({ amount: 10, count: 2 });
    expect(spendingEntries(txs, month, merchantMatcher('tim hortons')).map((t) => t.id)).toEqual([2, 1]);
  });

  it('groups by card, with hand-entered entries under Not set', () => {
    const a = accountSpending(txs, month);
    expect(a.map((x) => [x.key, x.amount])).toEqual([['BMO Mastercard', 90], ['Not set', 20], ['Neo', 10]]);
    expect(Math.round(a.reduce((s, x) => s + x.percentage, 0))).toBe(100);
  });
});
