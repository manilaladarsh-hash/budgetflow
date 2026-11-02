// "Import packs": a ready-made, already-categorised set of statement entries
// carried inside a link fragment (#/import?pack=...). Fragments are never
// sent to the web server, so the data goes straight from the link into this
// browser. Re-opening a pack is harmless: entries are de-duplicated by the
// same fingerprints the statement importer uses.

import { buildImportTransactions } from './importer.js';
import { categoryForConcept, learnRule } from './merchants.js';
import { periodStartFor } from './cycle.js';
import { dateFromDayKey, localDayKey } from './dates.js';
import { newId, INCOME_ID } from './transactions.js';
import { roundMoney } from './money.js';

export const PACK_VERSION = 1;

const toBase64Url = (bytes) => {
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const encodePack = async (pack) => {
  const json = new TextEncoder().encode(JSON.stringify(pack));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
};

export const decodePack = async (code) => {
  const cleaned = String(code || '').trim().replace(/^.*[#?&]pack=/, '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!cleaned) throw new Error('That import code is empty.');
  let pack;
  try {
    const bytes = await pipe(fromBase64Url(cleaned), new DecompressionStream('deflate-raw'));
    pack = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("That import code couldn't be read. Copy the whole link or code and try again.");
  }
  if (!pack || pack.v !== PACK_VERSION || !Array.isArray(pack.entries) || !Array.isArray(pack.budgets)) {
    throw new Error("That isn't a BudgetFlow import code.");
  }
  return pack;
};

const looseOf = (fp) => fp.split('|').slice(1).join('|');

// Pure: returns { state, added, skipped, createdBudgets, batchId }.
// pack = { v, label, budgets: [{ name, concept, icon, color, frequency, limit }],
//          entries: [[date, amount, 'o'|'i', merchant, raw, accountIdx, budgetIdx, fingerprint, key]],
//          accounts: [names], rules: [[key, budgetIdx]] }
export const applyPack = (state, pack, batchId = newId()) => {
  let categories = [...state.categories];
  const createdBudgets = [];
  const budgetIds = pack.budgets.map((b) => {
    const exact = categories.find((c) => c.name.trim().toLowerCase() === b.name.trim().toLowerCase());
    if (exact) return exact.id;
    const similar = b.concept && b.concept !== 'other' ? categoryForConcept(b.concept, categories, { strict: true }) : null;
    if (similar) return similar.id;
    const id = newId();
    const limit = roundMoney(b.limit || 0);
    categories = [...categories, {
      id, name: b.name, limit, balance: limit, icon: b.icon || 'circle', color: b.color || 'slate',
      frequency: b.frequency === 'monthly' ? 'monthly' : 'weekly', pinned: false,
      order: Math.max(-1, ...categories.map((c) => c.order ?? 0)) + 1
    }];
    createdBudgets.push(b.name);
    return id;
  });
  const working = { ...state, categories };

  const existing = new Set(state.transactions.filter((t) => t.importId).map((t) => t.importId));
  const existingLoose = new Set(state.transactions.filter((t) => t.importId && !t.importId.includes('|fit|')).map((t) => looseOf(t.importId)));
  const manual = state.transactions.filter((t) => !t.importId && t.categoryId !== 'system' && (t.type === 'expense' || t.type === 'income' || !t.type));
  const usedManual = new Set();
  let skipped = 0;
  const items = [];
  pack.entries.forEach(([date, amount, dir, merchant, raw, accountIdx, budgetIdx, fingerprint, key]) => {
    if (existing.has(fingerprint) || existingLoose.has(looseOf(fingerprint))) { skipped += 1; return; }
    const direction = dir === 'i' ? 'in' : 'out';
    const wantType = direction === 'out' ? 'expense' : 'income';
    const twin = manual.find((t) => !usedManual.has(t.id) && (t.type || 'expense') === wantType
      && Math.abs((Number(t.amount) || 0) - amount) < 0.01
      && Math.abs(Math.round((dateFromDayKey(date) - dateFromDayKey(localDayKey(t.date))) / 86400000) - 2) <= 3);
    if (twin) { usedManual.add(twin.id); skipped += 1; return; }
    const categoryId = budgetIdx === -1 ? INCOME_ID : budgetIds[budgetIdx];
    const category = categories.find((c) => c.id === categoryId);
    items.push({
      date, amount, direction, merchant, raw, key: key || '', account: pack.accounts[accountIdx] || 'Card',
      fingerprint, include: true, categoryId,
      historyOnly: !!category && dateFromDayKey(date) < periodStartFor(category, state.cycleStartDate)
    });
  });

  const txs = buildImportTransactions(items, working, batchId);
  let rules = state.importRules || [];
  (pack.rules || []).forEach(([key, budgetIdx]) => { rules = learnRule(rules, { key, categoryId: budgetIds[budgetIdx] }); });
  return { state: { ...working, importRules: rules }, transactions: txs, added: txs.length, skipped, createdBudgets, batchId };
};
