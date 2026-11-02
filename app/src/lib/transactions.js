// Pure transaction operations. Every function takes plain data and returns new
// data; nothing here touches storage or React.

import { roundMoney } from './money.js';

let idCounter = 0;
export const newId = () => {
  idCounter = (idCounter + 1) % 1000;
  return `${Date.now()}${String(idCounter).padStart(3, '0')}${Math.floor(Math.random() * 1000)}`;
};

export const txType = (t) => t?.type || 'expense';

export const isSystemTx = (t) => t?.categoryId === 'system' && txType(t) !== 'transfer';

// Counts as spending: real expenses (legacy records may have no type).
export const isSpending = (t) =>
  !!t && !!t.date && t.categoryId !== 'system' && txType(t) === 'expense';

export const isIncome = (t) => !!t && !!t.date && t.categoryId !== 'system' && txType(t) === 'income';

export const sortByDateDesc = (txs) =>
  [...txs].sort((a, b) => new Date(b.date) - new Date(a.date));

// Apply (direction 1) or reverse (direction -1) a transaction's effect on
// category balances. Legacy transfers carry amount 0 and no ids, so they are
// no-ops; new transfers record fromId/toId and can be reversed.
export const applyTransactionImpact = (categories, tx, direction = 1) => {
  // Imported entries from before the current budget period are history only.
  if (!tx || tx.affectsBalance === false) return categories;
  const amt = Number(tx.amount) || 0;
  if (txType(tx) === 'transfer') {
    if (!tx.fromId || !tx.toId || !amt) return categories;
    return categories.map((c) => {
      if (c.id === tx.fromId) return { ...c, balance: roundMoney(c.balance - amt * direction) };
      if (c.id === tx.toId) return { ...c, balance: roundMoney(c.balance + amt * direction) };
      return c;
    });
  }
  if (tx.categoryId === 'system' || txType(tx) === 'system') return categories;
  return categories.map((c) => {
    if (c.id !== tx.categoryId) return c;
    const delta = txType(tx) === 'income' ? amt : -amt;
    return { ...c, balance: roundMoney(c.balance + delta * direction) };
  });
};

export const buildTransaction = ({
  type = 'expense', amount, description = '', category, date, recurring = 'none', tags = [], extra = {}
}) => {
  const now = new Date().toISOString();
  const isExpense = type === 'expense';
  return {
    id: newId(),
    date: date || now,
    amount: roundMoney(amount),
    description: description.trim() || (isExpense ? 'Expense' : 'Income'),
    categoryId: category.id,
    categoryName: category.name,
    type: isExpense ? 'expense' : 'income',
    recurring: recurring || 'none',
    tags: [...new Set(tags)],
    createdAt: now,
    ...extra
  };
};

export const buildTransfer = ({ from, to, amount, date }) => {
  const now = new Date().toISOString();
  return {
    id: newId(),
    date: date || now,
    amount: roundMoney(amount),
    description: `Transfer: ${from.name} → ${to.name}`,
    categoryId: 'system',
    categoryName: 'Transfer',
    type: 'transfer',
    fromId: from.id,
    toId: to.id,
    recurring: 'none',
    createdAt: now
  };
};

export const addTransactions = (state, txs) => {
  let categories = state.categories;
  txs.forEach((tx) => { categories = applyTransactionImpact(categories, tx, 1); });
  return { ...state, categories, transactions: sortByDateDesc([...txs, ...state.transactions]) };
};

export const removeTransaction = (state, id) => {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return state;
  return {
    ...state,
    categories: applyTransactionImpact(state.categories, tx, -1),
    transactions: state.transactions.filter((t) => t.id !== id)
  };
};

export const replaceTransaction = (state, nextTx) => {
  const prev = state.transactions.find((t) => t.id === nextTx.id);
  if (!prev) return state;
  const categories = applyTransactionImpact(applyTransactionImpact(state.categories, prev, -1), nextTx, 1);
  return {
    ...state,
    categories,
    transactions: sortByDateDesc(state.transactions.map((t) => (t.id === nextTx.id ? nextTx : t)))
  };
};

// Restore a previously removed transaction (undo).
export const restoreTransaction = (state, tx) => {
  if (state.transactions.some((t) => t.id === tx.id)) return state;
  return addTransactions(state, [tx]);
};
