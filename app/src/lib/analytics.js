// Derived numbers for Home and Insights. All pure; all local-time aware.

import { addDays, daysInMonth, localDayKey, sameMonth, getNextSunday, shiftMonth } from './dates.js';
import { isIncome, isSpending } from './transactions.js';
import { roundMoney } from './money.js';

const amountOf = (t) => Number(t.amount) || 0;

export const totalBalance = (categories) => roundMoney(categories.reduce((s, c) => s + (Number(c.balance) || 0), 0));

// Monthly budget: monthly envelopes once, weekly envelopes for every week in
// the month (days / 7), so it matches the daily rate used for projections.
export const monthlyBudget = (categories, month = new Date()) => {
  const weeks = daysInMonth(month) / 7;
  return categories.reduce((s, c) => s + (c.frequency === 'monthly' ? Number(c.limit) || 0 : (Number(c.limit) || 0) * weeks), 0);
};

export const weeklyBudget = (categories) =>
  categories.filter((c) => c.frequency !== 'monthly').reduce((s, c) => s + (Number(c.limit) || 0), 0);

export const dailyBudget = (categories) =>
  categories.reduce((s, c) => s + (c.frequency === 'monthly' ? (Number(c.limit) || 0) / 30 : (Number(c.limit) || 0) / 7), 0);

export const spentInMonth = (txs, month) =>
  roundMoney(txs.filter((t) => isSpending(t) && sameMonth(t.date, month)).reduce((s, t) => s + amountOf(t), 0));

export const incomeInMonth = (txs, month) =>
  roundMoney(txs.filter((t) => isIncome(t) && sameMonth(t.date, month)).reduce((s, t) => s + amountOf(t), 0));

export const spentOnDay = (txs, day = new Date()) => {
  const key = localDayKey(day);
  return roundMoney(txs.filter((t) => isSpending(t) && localDayKey(t.date) === key).reduce((s, t) => s + amountOf(t), 0));
};

export const healthGrade = (ratio) => {
  if (ratio <= 0.7) return { grade: 'A', tone: 'good' };
  if (ratio <= 0.9) return { grade: 'B', tone: 'good' };
  if (ratio <= 1.0) return { grade: 'C', tone: 'warn' };
  if (ratio <= 1.2) return { grade: 'D', tone: 'warn' };
  return { grade: 'F', tone: 'bad' };
};

// Weekly pace across weekly envelopes in the current cycle.
export const cyclePace = ({ categories, transactions, cycleStartDate, now = new Date() }) => {
  const start = new Date(cycleStartDate);
  const end = getNextSunday(start);
  const totalMs = Math.max(1, end - start);
  const elapsed = Math.min(1, Math.max(0, (now - start) / totalMs));
  const weeklyIds = new Set(categories.filter((c) => c.frequency !== 'monthly').map((c) => c.id));
  const budget = weeklyBudget(categories);
  const spent = roundMoney(transactions
    .filter((t) => isSpending(t) && weeklyIds.has(t.categoryId) && new Date(t.date) >= start)
    .reduce((s, t) => s + amountOf(t), 0));
  const expected = budget * elapsed;
  const ratio = expected > 0 ? spent / expected : 0;
  const daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
  const status = ratio <= 0.85 ? 'under' : ratio <= 1.1 ? 'on' : 'over';
  return {
    budget, spent, expected, elapsed, ratio, status, end, daysLeft,
    msLeft: Math.max(0, end - now),
    perDayLeft: daysLeft > 0 ? Math.max(0, (budget - spent) / daysLeft) : 0
  };
};

export const billsWithStatus = (bills, now = new Date()) => {
  const monthKey = `${now.getFullYear()}-${now.getMonth()}`;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return bills.map((b) => {
    const isPaid = b.lastPaidMonth === monthKey;
    const lastDay = daysInMonth(now);
    const dueDate = new Date(now.getFullYear(), now.getMonth(), Math.min(Math.max(1, Number(b.dueDay) || 1), lastDay));
    const daysUntilDue = Math.round((dueDate - today) / 86400000);
    return {
      ...b,
      isPaid,
      dueDate,
      daysUntilDue,
      isOverdue: !isPaid && daysUntilDue < 0,
      isDueSoon: !isPaid && daysUntilDue >= 0 && daysUntilDue <= 3
    };
  }).sort((a, b) => (a.isPaid - b.isPaid) || a.daysUntilDue - b.daysUntilDue);
};

export const subscriptionMonthly = (s) => {
  const amt = Number(s.amount) || 0;
  if (s.frequency === 'weekly') return amt * 4.33;
  if (s.frequency === 'yearly') return amt / 12;
  return amt;
};

export const totalMonthlySubscriptions = (subs) =>
  roundMoney(subs.filter((s) => s.active).reduce((sum, s) => sum + subscriptionMonthly(s), 0));

export const upcomingSubscriptions = (subs, now = new Date(), days = 7) => {
  const today = localDayKey(now);
  const limit = localDayKey(addDays(now, days));
  return subs
    .filter((s) => s.active && s.nextDue && s.nextDue >= today && s.nextDue <= limit)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue));
};

export const advanceDue = (dayKey, frequency) => {
  const [y, m, d] = String(dayKey).split('-').map(Number);
  const base = new Date(y, (m || 1) - 1, d || 1, 12);
  if (frequency === 'weekly') base.setDate(base.getDate() + 7);
  else if (frequency === 'yearly') base.setFullYear(base.getFullYear() + 1);
  else {
    const day = base.getDate();
    base.setDate(1);
    base.setMonth(base.getMonth() + 1);
    base.setDate(Math.min(day, daysInMonth(base)));
  }
  return localDayKey(base);
};

// Expected spending by month end. Early in the month a few purchases make a
// straight-line projection swing wildly, so the first week assumes the
// planned daily budget for the remaining days.
export const projectMonthSpend = (categories, monthSpent, now = new Date()) => {
  const day = Math.max(1, now.getDate());
  const rate = day >= 7 ? monthSpent / day : monthlyBudget(categories, now) / daysInMonth(now);
  return monthSpent + rate * (daysInMonth(now) - day);
};

// Overview numbers for the Home hero.
export const overview = ({ categories, transactions, bills, cycleStartDate, now = new Date() }) => {
  const balance = totalBalance(categories);
  const pace = cyclePace({ categories, transactions, cycleStartDate, now });
  const unpaidBills = roundMoney(billsWithStatus(bills, now).filter((b) => !b.isPaid).reduce((s, b) => s + (Number(b.amount) || 0), 0));
  const committed = Math.max(0, unpaidBills) + Math.max(0, pace.budget - pace.spent);
  const safeToSpend = roundMoney(Math.max(0, balance - committed));
  const monthSpent = spentInMonth(transactions, now);
  const monthIncome = incomeInMonth(transactions, now);
  const dayOfMonth = Math.max(1, now.getDate());
  const projected = projectMonthSpend(categories, monthSpent, now);
  const budget = monthlyBudget(categories, now);
  const ratio = budget > 0 ? monthSpent / (budget * (dayOfMonth / 30)) : 0;
  return {
    balance,
    pace,
    unpaidBills,
    safeToSpend,
    monthSpent,
    monthIncome,
    savingsRate: monthIncome > 0 ? ((monthIncome - monthSpent) / monthIncome) * 100 : 0,
    dailyAvg: monthSpent / dayOfMonth,
    targetDaily: budget / daysInMonth(now),
    projected,
    // Positive: expected to finish the month under budget by this much.
    forecastMonthEnd: roundMoney(budget - projected),
    grade: healthGrade(ratio),
    monthlyBudget: budget
  };
};

export const categorySpending = (txs, categories, month) => {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const groups = new Map();
  txs.forEach((t) => {
    if (!isSpending(t) || !sameMonth(t.date, month)) return;
    const cat = byId.get(t.categoryId) || categories.find((c) => c.name === t.categoryName);
    const key = cat?.id || `name:${t.categoryName || 'Other'}`;
    const g = groups.get(key) || { id: key, name: cat?.name || t.categoryName || 'Other', icon: cat?.icon || 'circle', color: cat?.color, amount: 0, count: 0 };
    g.amount += amountOf(t);
    g.count += 1;
    groups.set(key, g);
  });
  const list = [...groups.values()];
  const total = list.reduce((s, g) => s + g.amount, 0);
  return list
    .map((g) => ({ ...g, amount: roundMoney(g.amount), percentage: total > 0 ? (g.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
};

export const dailySeries = (txs, now = new Date(), range = 7) => {
  const days = [];
  for (let i = range - 1; i >= 0; i -= 1) {
    const d = addDays(now, -i);
    days.push({ key: localDayKey(d), date: d, total: 0 });
  }
  const index = new Map(days.map((d) => [d.key, d]));
  txs.forEach((t) => {
    if (!isSpending(t)) return;
    const slot = index.get(localDayKey(t.date));
    if (slot) slot.total += amountOf(t);
  });
  const max = Math.max(...days.map((d) => d.total), 0);
  const avg = days.reduce((s, d) => s + d.total, 0) / days.length;
  return { days: days.map((d) => ({ ...d, total: roundMoney(d.total) })), max, avg };
};

export const monthComparison = (txs, categories, month) => {
  const current = categorySpending(txs, categories, month);
  const previousMonth = shiftMonth(month, -1);
  const previous = categorySpending(txs, categories, previousMonth);
  const ids = [...new Set([...current.map((c) => c.id), ...previous.map((c) => c.id)])];
  const rows = ids.map((id) => {
    const c = current.find((x) => x.id === id);
    const p = previous.find((x) => x.id === id);
    const cur = c?.amount || 0;
    const prev = p?.amount || 0;
    return { id, name: (c || p).name, icon: (c || p).icon, color: (c || p).color, current: cur, previous: prev, change: prev ? ((cur - prev) / prev) * 100 : null };
  }).sort((a, b) => b.current - a.current);
  const currentTotal = current.reduce((s, c) => s + c.amount, 0);
  const previousTotal = previous.reduce((s, c) => s + c.amount, 0);
  return {
    rows, currentTotal, previousTotal, previousMonth,
    totalChange: previousTotal ? ((currentTotal - previousTotal) / previousTotal) * 100 : null
  };
};

export const heatmap = (txs, month) => {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const dim = daysInMonth(month);
  const totals = new Map();
  txs.forEach((t) => {
    if (!isSpending(t) || !sameMonth(t.date, month)) return;
    const k = localDayKey(t.date);
    totals.set(k, (totals.get(k) || 0) + amountOf(t));
  });
  const cells = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) {
    const key = localDayKey(new Date(month.getFullYear(), month.getMonth(), d));
    cells.push({ day: d, key, total: roundMoney(totals.get(key) || 0) });
  }
  const max = Math.max(0, ...cells.filter(Boolean).map((c) => c.total));
  return { cells, max };
};

export const insightsFor = ({ categories, transactions, month, now = new Date() }) => {
  const list = [];
  const spending = categorySpending(transactions, categories, month);
  const top = spending[0];
  if (top) list.push({ tone: 'info', text: `${top.name} is your top category this month (${top.percentage.toFixed(0)}% of spending).`, amount: top.amount });
  const series = dailySeries(transactions, now, 7);
  const peak = series.days.reduce((m, d) => (d.total > m.total ? d : m), series.days[0]);
  if (peak && peak.total > 0) list.push({ tone: 'warn', text: `Biggest day this week: ${peak.date.toLocaleDateString(undefined, { weekday: 'long' })}.`, amount: peak.total });
  if (sameMonth(month, now)) {
    const budget = monthlyBudget(categories, now);
    const spent = spentInMonth(transactions, now);
    const projected = projectMonthSpend(categories, spent, now);
    if (budget > 0 && spent > 0) {
      if (projected > budget) list.push({ tone: 'bad', text: 'At this pace you will go over your monthly budget by', amount: projected - budget });
      else list.push({ tone: 'good', text: 'On track to finish the month under budget by', amount: budget - projected });
    }
  }
  const recurring = transactions.filter((t) => t.recurring === 'weekly' || t.recurring === 'monthly');
  if (recurring.length) list.push({ tone: 'info', text: `${recurring.length} recurring ${recurring.length === 1 ? 'entry renews' : 'entries renew'} automatically each cycle.` });
  return list;
};

export const monthlyHistory = (txs, limit = 12) => {
  const groups = new Map();
  txs.forEach((t) => {
    if (!isSpending(t)) return;
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const g = groups.get(key) || { key, month: new Date(d.getFullYear(), d.getMonth(), 1, 12), total: 0 };
    g.total += amountOf(t);
    groups.set(key, g);
  });
  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key)).slice(0, limit).map((g) => ({ ...g, total: roundMoney(g.total) }));
};

// Streak: consecutive days with spending at or under the daily budget.
export const updateStreak = ({ streak, lastDate, todaySpent, dailyLimit, now = new Date() }) => {
  const today = localDayKey(now);
  if (lastDate === today) return null;
  if (!(todaySpent > 0) || todaySpent > dailyLimit) return null;
  const yesterday = localDayKey(addDays(now, -1));
  const next = lastDate === yesterday ? (streak || 0) + 1 : 1;
  return { streak: next, lastDate: today };
};

export const goalPlan = (goal, now = new Date()) => {
  const remaining = Math.max(0, (Number(goal.target) || 0) - (Number(goal.saved) || 0));
  if (!goal.deadline || remaining <= 0) return { remaining, perWeek: null, weeksLeft: null };
  const end = new Date(`${goal.deadline}T23:59:59`);
  const weeksLeft = Math.max(0, (end - now) / (7 * 86400000));
  return { remaining, weeksLeft, perWeek: weeksLeft > 0 ? remaining / Math.max(1, weeksLeft) : remaining };
};

// ---- Money story (Insights) ----

const inMonth = (t, month) => sameMonth(t.date, month);

// Money in vs out for a month. "Income" is budget-free income; refunds are
// money back into a budget and reduce what was spent there.
export const cashFlow = (txs, month) => {
  let income = 0;
  let refunds = 0;
  let spent = 0;
  let count = 0;
  txs.forEach((t) => {
    if (!inMonth(t, month)) return;
    if (isSpending(t)) { spent += amountOf(t); count += 1; }
    else if (isIncome(t)) {
      if (t.categoryId === 'income') income += amountOf(t);
      else refunds += amountOf(t);
    }
  });
  const net = income + refunds - spent;
  return {
    income: roundMoney(income),
    refunds: roundMoney(refunds),
    spent: roundMoney(spent),
    net: roundMoney(net),
    count,
    savingsRate: income > 0 ? (net / income) * 100 : null
  };
};

const groupSpending = (txs, month, keyOf, labelOf) => {
  const groups = new Map();
  txs.forEach((t) => {
    if (!isSpending(t) || !inMonth(t, month)) return;
    const key = keyOf(t);
    if (!key) return;
    const g = groups.get(key) || { key, name: labelOf(t), amount: 0, count: 0, categoryId: t.categoryId };
    g.amount += amountOf(t);
    g.count += 1;
    groups.set(key, g);
  });
  const list = [...groups.values()];
  const total = list.reduce((s, g) => s + g.amount, 0);
  return list
    .map((g) => ({ ...g, amount: roundMoney(g.amount), percentage: total > 0 ? (g.amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);
};

const merchantKeyOf = (t) => String(t.description || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Where the money went, by merchant (the entry's note / cleaned merchant name).
export const merchantSpending = (txs, month, limit = 8) =>
  groupSpending(txs, month, (t) => merchantKeyOf(t) || null, (t) => String(t.description || '').trim()).slice(0, limit);

// Where the money went, by card or account (imported and Apple Pay entries).
export const accountSpending = (txs, month) =>
  groupSpending(txs, month, (t) => t.account || 'Not set', (t) => t.account || 'Not set');

// The spending entries behind one slice, newest first.
export const spendingEntries = (txs, month, match) =>
  txs.filter((t) => isSpending(t) && inMonth(t, month) && match(t)).sort((a, b) => new Date(b.date) - new Date(a.date));

export const merchantMatcher = (key) => (t) => merchantKeyOf(t) === key;
