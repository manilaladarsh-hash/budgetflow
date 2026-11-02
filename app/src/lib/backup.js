// JSON backup / restore and CSV export. The backup keeps the legacy field
// names so files from the old app restore here and vice versa.

import { normalizeState } from './storage.js';
import { localDayKey } from './dates.js';

export const BACKUP_VERSION = 3;

export const createBackup = (state, now = new Date()) => ({
  version: BACKUP_VERSION,
  app: 'BudgetFlow',
  exportedAt: now.toISOString(),
  categories: state.categories,
  transactions: state.transactions,
  weeksTracked: state.weeksTracked,
  cycleStartDate: state.cycleStartDate,
  cycleHistory: state.cycleHistory,
  streak: state.streak.count,
  streakDate: state.streak.lastDate,
  achievements: state.achievements,
  savingsGoals: state.goals,
  subscriptions: state.subscriptions,
  netWorthItems: state.netWorth,
  wishlist: state.wishlist,
  bills: state.bills,
  availableTags: state.tags,
  dailySpendLimit: state.prefs.dailyLimit,
  txAlertThreshold: state.prefs.alertThreshold,
  currency: state.prefs.currency,
  userName: state.prefs.name,
  importRules: state.importRules,
  importProfiles: state.importProfiles
});

// Parses a backup file into a full state, keeping current values for any
// section the file does not contain. Throws on invalid input.
export const parseBackup = (text, current) => {
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!d || !Array.isArray(d.categories) || !Array.isArray(d.transactions)) {
    throw new Error('This file is not a BudgetFlow backup.');
  }
  const pick = (v, fallback) => (v === undefined || v === null ? fallback : v);
  const merged = {
    categories: d.categories,
    transactions: d.transactions,
    weeksTracked: pick(d.weeksTracked, 1),
    cycleStartDate: pick(d.cycleStartDate, current.cycleStartDate),
    cycleHistory: pick(d.cycleHistory, current.cycleHistory),
    goals: pick(d.savingsGoals, current.goals),
    subscriptions: pick(d.subscriptions, current.subscriptions),
    bills: pick(d.bills, current.bills),
    netWorth: pick(d.netWorthItems, current.netWorth),
    wishlist: pick(d.wishlist, current.wishlist),
    tags: pick(d.availableTags, current.tags),
    streak: { count: pick(d.streak, current.streak.count), lastDate: pick(d.streakDate, current.streak.lastDate) },
    achievements: pick(d.achievements, current.achievements),
    importRules: pick(d.importRules, current.importRules),
    importProfiles: pick(d.importProfiles, current.importProfiles),
    prefs: {
      ...current.prefs,
      dailyLimit: pick(d.dailySpendLimit, current.prefs.dailyLimit),
      alertThreshold: pick(d.txAlertThreshold, current.prefs.alertThreshold),
      currency: pick(d.currency, current.prefs.currency),
      name: pick(d.userName, current.prefs.name),
      onboarded: true
    }
  };
  return normalizeState(merged);
};

const csvCell = (value) => {
  const s = String(value ?? '');
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const transactionsToCsv = (transactions) => {
  const header = ['Date', 'Description', 'Category', 'Amount', 'Type', 'Recurring', 'Tags', 'Account'];
  const rows = transactions
    .filter((t) => t.type !== 'system')
    .map((t) => [
      localDayKey(t.date),
      t.description,
      t.categoryName,
      Number(t.amount) || 0,
      t.type || 'expense',
      t.recurring || 'none',
      (t.tags || []).join(' '),
      t.account || ''
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
};

export const downloadFile = (filename, content, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
