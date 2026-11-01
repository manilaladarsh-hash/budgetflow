// Date helpers. Everything that decides "which day" uses the device's local
// time zone (the legacy app used UTC via toISOString(), which moved evening
// spending onto the next day).

const pad = (n) => String(n).padStart(2, '0');

export const localDayKey = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// "2026-11-01" -> Date at local noon (stable against DST edges).
export const dateFromDayKey = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
};

export const startOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const addDays = (value, days) => {
  const d = new Date(value);
  d.setDate(d.getDate() + days);
  return d;
};

// Next Sunday 00:00 strictly after the given day (a Sunday returns +7 days).
export const getNextSunday = (fromDate) => {
  const d = startOfDay(fromDate);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? 7 : 7 - day));
  return d;
};

export const startOfWeekSunday = (value) => {
  const d = startOfDay(value);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

export const formatCountdown = (ms) => {
  if (ms <= 0) return '0m';
  const totalSec = Math.floor(ms / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const sameMonth = (a, b) => {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth();
};

export const daysInMonth = (value) => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

export const shiftMonth = (value, delta) => {
  const d = new Date(value);
  return new Date(d.getFullYear(), d.getMonth() + delta, 1, 12);
};

export const formatDay = (value) =>
  new Date(value).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export const formatMonth = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

export const formatShortDate = (value) =>
  new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const formatTime = (value) =>
  new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// "Today", "Yesterday" or a short weekday date for list headers.
export const relativeDayLabel = (dayKey, now = new Date()) => {
  const today = localDayKey(now);
  const yesterday = localDayKey(addDays(now, -1));
  if (dayKey === today) return 'Today';
  if (dayKey === yesterday) return 'Yesterday';
  const d = dateFromDayKey(dayKey);
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
};

// Combine a chosen day with the current time-of-day so backdated entries keep
// a sensible order; today's entries keep the exact current time.
export const isoForDay = (dayKey, now = new Date()) => {
  if (!dayKey || dayKey === localDayKey(now)) return now.toISOString();
  const d = dateFromDayKey(dayKey);
  if (Number.isNaN(d.getTime())) return now.toISOString();
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return d.toISOString();
};
