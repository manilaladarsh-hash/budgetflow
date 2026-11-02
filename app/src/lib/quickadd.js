// Quick-add links (Apple Pay via iPhone Shortcuts, or any other automation).
//   #/add?amount=6.45&merchant=Starbucks&card=Amex%20Cobalt&auto=1
// amount accepts "$6.45", "CA$6.45", "6,45 $". type=income is optional.

import { parseMoney } from './importer.js';
import { cleanMerchant, merchantKey, suggestCategory, historyIndex } from './merchants.js';
import { buildTransaction } from './transactions.js';
import { roundMoney } from './money.js';

// Shortcuts can fire twice for one tap; treat a repeat within 3 minutes as the same purchase.
const DUPLICATE_WINDOW_MS = 3 * 60 * 1000;

const safeDecode = (s) => {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')); } catch { return s; }
};

export const parseQuickAdd = (query) => {
  const params = {};
  String(query || '').split('&').forEach((pair) => {
    const i = pair.indexOf('=');
    if (i <= 0) return;
    params[safeDecode(pair.slice(0, i)).toLowerCase()] = safeDecode(pair.slice(i + 1)).trim();
  });
  const amount = Math.abs(parseMoney(params.amount ?? params.a ?? '') ?? NaN);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount: roundMoney(amount),
    merchant: (params.merchant || params.m || params.note || params.description || '').slice(0, 80),
    card: (params.card || params.account || '').slice(0, 30),
    type: params.type === 'income' ? 'income' : 'expense',
    auto: ['1', 'true', 'yes'].includes(String(params.auto || '').toLowerCase()),
    category: params.category || params.budget || ''
  };
};

// Decide what to do with a quick-add request:
// add (automatic), confirm (open the add sheet), duplicate, or skipped (by a rule).
export const planQuickAdd = (request, state, now = new Date()) => {
  const { categories, transactions } = state;
  const description = cleanMerchant(request.merchant) || request.merchant || (request.type === 'income' ? 'Income' : 'Apple Pay');
  const key = merchantKey(request.merchant);
  const extra = { source: 'applepay', ...(request.card ? { account: request.card } : {}), ...(request.merchant ? { originalDescription: request.merchant } : {}) };

  const duplicate = transactions.find((t) => t.source === 'applepay'
    && Math.abs((Number(t.amount) || 0) - request.amount) < 0.01
    && merchantKey(t.originalDescription || t.description) === key
    && now - new Date(t.createdAt || t.date) < DUPLICATE_WINDOW_MS);
  if (duplicate) return { action: 'duplicate', transaction: duplicate };

  const named = request.category && categories.find((c) => c.name.toLowerCase() === request.category.toLowerCase());
  const suggestion = named ? { categoryId: named.id, source: 'rule' } : suggestCategory({
    description: request.merchant, categories, rules: state.importRules || [], history: historyIndex(transactions)
  });
  const addOptions = {
    type: request.type,
    categoryId: suggestion?.categoryId || '',
    prefill: { amount: request.amount, description, extra }
  };
  if (suggestion?.skip) return { action: 'skipped', addOptions };
  const category = categories.find((c) => c.id === suggestion?.categoryId);
  if (request.auto && category) {
    return {
      action: 'add',
      suggestion,
      transaction: buildTransaction({ type: request.type, amount: request.amount, description, category, extra })
    };
  }
  return { action: 'confirm', suggestion, addOptions };
};

export const quickAddTemplate = (base) => `${base}#/add?auto=1&amount=AMOUNT&merchant=MERCHANT&card=CARD`;
