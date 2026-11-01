// Currency formatting. The legacy app stored a currency *symbol* under the
// `currency` key during onboarding but never used it; it is now applied
// everywhere through these helpers.

export const CURRENCIES = ['$', '€', '£', '¥', '₹', '₩', '₱', '₦', 'R', 'CHF'];

const toNumber = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};

export const roundMoney = (value) => Math.round(toNumber(value) * 100) / 100;

// formatMoney(-12.5, '€') -> "−€12.50"; whole amounts drop the decimals
// unless `decimals` is given.
export const formatMoney = (value, symbol = '$', { decimals, signed = false } = {}) => {
  const n = roundMoney(value);
  const abs = Math.abs(n);
  const places = decimals ?? (Number.isInteger(abs) ? 0 : 2);
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: places, maximumFractionDigits: places });
  const sep = symbol.length > 1 ? ' ' : '';
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : '';
  return `${sign}${symbol}${sep}${body}`;
};

// Compact form for tight spaces: 1250 -> "$1.3k".
export const formatMoneyCompact = (value, symbol = '$') => {
  const n = roundMoney(value);
  const abs = Math.abs(n);
  if (abs < 10000) return formatMoney(Math.round(n), symbol);
  const sign = n < 0 ? '−' : '';
  const sep = symbol.length > 1 ? ' ' : '';
  return `${sign}${symbol}${sep}${(abs / 1000).toFixed(abs < 100000 ? 1 : 0)}k`;
};

// Accepts "12.50", "12,50", " $12 ", "1,234.5". Returns NaN when invalid.
export const parseAmount = (input) => {
  if (typeof input === 'number') return Number.isFinite(input) ? input : NaN;
  let s = String(input ?? '').trim().replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && !s.includes('.')) {
    // "12,50" is a decimal comma; "1,234" is a thousands separator.
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
};

export const isPositiveAmount = (input) => {
  const n = parseAmount(input);
  return Number.isFinite(n) && n > 0;
};
