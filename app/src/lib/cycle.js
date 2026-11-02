// Weekly budget cycle renewal (cycles end at local Sunday 00:00).
//
// Ported from the legacy performAutoReset with three fixes:
//  * several missed weeks are caught up one cycle at a time;
//  * recurring transactions are templates: generated copies are marked
//    recurring:'none' + recurringSourceId so they never multiply;
//  * spending for the cycle summary is computed per cycle window.

import { getNextSunday } from './dates.js';
import { applyTransactionImpact, isSpending, newId } from './transactions.js';
import { roundMoney } from './money.js';

export const ROLLOVER_CAP = 0.5;
const MAX_CATCH_UP = 60;

export const isRecurringTemplate = (t) =>
  !!t && (t.recurring === 'weekly' || t.recurring === 'monthly') && !t.recurringSourceId;

export const cycleEndFor = (cycleStartDate) => getNextSunday(new Date(cycleStartDate));

export const rolloverFor = (category) => {
  const limit = Number(category.limit) || 0;
  const balance = Number(category.balance) || 0;
  return balance < 0 ? balance : Math.min(balance, limit * ROLLOVER_CAP);
};

// One cycle step: the cycle that started at `start` ends at `boundary`.
const renewOnce = (state, start, boundary) => {
  const isNewMonth = boundary.getMonth() !== start.getMonth() || boundary.getFullYear() !== start.getFullYear();
  const cycleNumber = state.weeksTracked;
  const nextWeeks = cycleNumber + 1;

  const spentInCycle = state.transactions
    .filter((t) => isSpending(t) && new Date(t.date) >= start && new Date(t.date) < boundary)
    .reduce((s, t) => s + (Number(t.amount) || 0), 0);

  const cycleEntry = {
    cycle: cycleNumber,
    startDate: start.toISOString(),
    endDate: boundary.toISOString(),
    totalSpent: roundMoney(spentInCycle),
    categorySummary: state.categories.map((c) => ({
      name: c.name, limit: c.limit, balance: c.balance, spent: roundMoney(c.limit - c.balance)
    }))
  };
  const noOverdraft = state.categories.every((c) => c.balance >= 0);

  let categories = state.categories.map((c) => {
    const reset = c.frequency !== 'monthly' || isNewMonth;
    if (!reset) return c;
    const rollover = roundMoney(rolloverFor(c));
    return { ...c, balance: roundMoney((Number(c.limit) || 0) + rollover), lastRollover: rollover };
  });

  const rolloverSummary = categories
    .filter((c) => c.lastRollover !== undefined && c.lastRollover !== null && c !== state.categories.find((o) => o.id === c.id))
    .map((c) => `${c.name}: ${c.lastRollover >= 0 ? '+' : ''}${Math.round(c.lastRollover)}`)
    .join(', ');
  cycleEntry.rolloverSummary = rolloverSummary;

  const templates = state.transactions.filter(
    (t) => isRecurringTemplate(t) && (t.recurring === 'weekly' || isNewMonth) && (t.categoryId === 'income' || categories.some((c) => c.id === t.categoryId))
  );
  const generated = templates.map((tpl, i) => {
    const tx = {
      ...tpl,
      id: newId(),
      date: new Date(boundary.getTime() + 1000 + i).toISOString(),
      description: `🔁 ${tpl.description}`,
      recurring: 'none',
      recurringSourceId: tpl.id,
      createdAt: new Date().toISOString()
    };
    delete tx.updatedAt;
    return tx;
  });
  generated.forEach((tx) => { categories = applyTransactionImpact(categories, tx, 1); });

  const log = {
    id: newId(),
    date: boundary.toISOString(),
    amount: 0,
    description: `🔄 Cycle ${nextWeeks} started${rolloverSummary ? ` (rollover: ${rolloverSummary})` : ''}`,
    categoryId: 'system',
    categoryName: 'System',
    type: 'system'
  };

  return {
    state: {
      ...state,
      categories,
      transactions: [...generated.reverse(), log, ...state.transactions],
      weeksTracked: nextWeeks,
      cycleStartDate: boundary.toISOString(),
      cycleHistory: [...(state.cycleHistory || []), cycleEntry].slice(-52)
    },
    noOverdraft
  };
};

// Returns { state, renewed, noOverdraft } — renewed is how many cycles ended.
export const renewCycles = (state, now = new Date()) => {
  let current = state;
  let renewed = 0;
  let noOverdraft = true;
  let start = new Date(current.cycleStartDate);
  if (Number.isNaN(start.getTime())) return { state, renewed: 0, noOverdraft: false };
  while (renewed < MAX_CATCH_UP) {
    const boundary = getNextSunday(start);
    if (now < boundary) break;
    const step = renewOnce(current, start, boundary);
    current = step.state;
    noOverdraft = noOverdraft && step.noOverdraft;
    start = boundary;
    renewed += 1;
  }
  if (!renewed) return { state, renewed: 0, noOverdraft: false };
  return {
    state: { ...current, transactions: [...current.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)) },
    renewed,
    noOverdraft
  };
};

// Start of the budget period a category is currently in. Weekly budgets
// follow the cycle; monthly ones started at the first cycle of this month.
export const periodStartFor = (category, cycleStartDate) => {
  const start = new Date(cycleStartDate);
  if (category?.frequency !== 'monthly') return start;
  let s = start;
  for (let i = 0; i < 6; i += 1) {
    const prev = new Date(s);
    prev.setDate(prev.getDate() - 7);
    if (prev.getMonth() !== start.getMonth()) break;
    s = prev;
  }
  return s;
};

// What each category would hold after the next renewal (for the cycle sheet).
export const rolloverPreview = (categories, cycleStartDate) => {
  const start = new Date(cycleStartDate);
  const boundary = getNextSunday(start);
  const isNewMonth = boundary.getMonth() !== start.getMonth();
  return categories.map((c) => {
    const resets = c.frequency !== 'monthly' || isNewMonth;
    const rollover = resets ? roundMoney(rolloverFor(c)) : 0;
    return { ...c, resets, rollover, nextBalance: resets ? roundMoney(c.limit + rollover) : c.balance };
  });
};
