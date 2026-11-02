// Bank / card statement import: CSV (any bank layout) and OFX/QFX/QBO.
// Pure functions only — the UI lives in features/Import.jsx.

import { cleanMerchant, merchantKey, suggestCategory, historyIndex } from './merchants.js';
import { dateFromDayKey, localDayKey } from './dates.js';
import { roundMoney } from './money.js';
import { buildTransaction, newId } from './transactions.js';
import { periodStartFor } from './cycle.js';

// ---------------------------------------------------------------- CSV ----

const detectDelimiter = (text) => {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 8);
  const score = (d) => lines.reduce((s, l) => s + (l.split(d).length - 1), 0);
  return [',', ';', '\t', '|'].map((d) => [d, score(d)]).sort((a, b) => b[1] - a[1])[0][0];
};

export const parseCsv = (input) => {
  const text = String(input || '').replace(/^﻿/, '');
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (ch === delim) {
      row.push(cell.trim()); cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell.trim()); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
};

// -------------------------------------------------------------- Dates ----

const MONTHS = {
  JAN: 1, JANV: 1, JANVIER: 1, JANUARY: 1, FEB: 2, FEV: 2, FÉV: 2, FEVR: 2, FÉVR: 2, FEBRUARY: 2, FÉVRIER: 2, FEVRIER: 2,
  MAR: 3, MARS: 3, MARCH: 3, APR: 4, AVR: 4, APRIL: 4, AVRIL: 4, MAY: 5, MAI: 5, JUN: 6, JUIN: 6, JUNE: 6,
  JUL: 7, JUIL: 7, JULY: 7, JUILLET: 7, AUG: 8, AOU: 8, AOÛ: 8, AOUT: 8, AOÛT: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9, SEPTEMBRE: 9,
  OCT: 10, OCTOBER: 10, OCTOBRE: 10, NOV: 11, NOVEMBER: 11, NOVEMBRE: 11, DEC: 12, DÉC: 12, DECEMBER: 12, DÉCEMBRE: 12, DECEMBRE: 12
};
const pad = (n) => String(n).padStart(2, '0');
const validKey = (y, m, d) => {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 1990 && y <= 2100)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
};

// order: 'MDY' | 'DMY' for numeric dates with the year last.
export const parseDate = (value, order = 'MDY') => {
  const s = String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return validKey(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})(?:\d{6})?(?:\.\d+)?(?:\[.*\])?$/);
  if (m) return validKey(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return order === 'DMY' ? validKey(+m[3], +m[2], +m[1]) : validKey(+m[3], +m[1], +m[2]);
  // "30 Oct. 2026", "30-Oct-26", "30 octobre 2026"
  m = s.match(/^(\d{1,2})[ -]([A-ZÉÛ]{3,9})\.?,?[ -](\d{2,4})$/);
  if (m && MONTHS[m[2]]) return validKey(+m[3], MONTHS[m[2]], +m[1]);
  // "Oct 30, 2026", "October 30 2026"
  m = s.match(/^([A-ZÉÛ]{3,9})\.? (\d{1,2}),? (\d{4})$/);
  if (m && MONTHS[m[1]]) return validKey(+m[3], MONTHS[m[1]], +m[2]);
  return null;
};

// Works out whether numeric dates in a column are month-first or day-first.
export const detectDateOrder = (values) => {
  let mdy = false;
  let dmy = false;
  values.forEach((v) => {
    const m = String(v || '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (!m) return;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  });
  if (mdy && !dmy) return { order: 'MDY', ambiguous: false };
  if (dmy && !mdy) return { order: 'DMY', ambiguous: false };
  const numeric = values.some((v) => /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(String(v || '').trim()));
  return { order: 'MDY', ambiguous: numeric };
};

// ------------------------------------------------------------- Amounts ----

// "$1,234.56", "-12.34", "(12.34)", "12.34-", "1 234,56 $", "12.34 CR"
export const parseMoney = (value) => {
  let s = String(value ?? '').trim().toUpperCase();
  if (!s) return null;
  let sign = 1;
  if (/\bCR\b|CRÉDIT$/.test(s)) { sign = -1; s = s.replace(/\bCR\b|CRÉDIT$/, ''); }
  s = s.replace(/\bDR\b/, '');
  if (/^\(.*\)$/.test(s)) { sign *= -1; s = s.slice(1, -1); }
  s = s.replace(/[A-Z$€£¥₹\s ]/g, '');
  if (s.endsWith('-')) { sign *= -1; s = s.slice(0, -1); }
  if (s.startsWith('-')) { sign *= -1; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^[\d.,]+$/.test(s)) return null;
  if (/,\d{2}$/.test(s) && !/\.\d{2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return Number.isFinite(n) ? sign * n : null;
};

// ------------------------------------------------------ Column roles ----

const ROLE_TESTS = [
  ['date', /^(?:transaction date|trans\.? date|date of transaction|date de (?:la )?transaction|date d'op[ée]ration|date)$/],
  ['postedDate', /^(?:posted date|posting date|date posted|post date|date processed|date de comptabilisation|date d'inscription)$/],
  ['description', /^(?:description|description 1|merchant|merchant name|payee|name|details|transaction details|transaction description|narrative|libell[ée]|description de la transaction|nom)$/],
  ['description2', /^(?:description 2|sub-?description|memo|note|notes|extended details|additional info|détails)$/],
  ['amount', /^(?:amount|cad\$?|amount \(cad\)|amount \(\$\)|transaction amount|montant|amount cad|net amount|value)$/],
  ['debit', /^(?:debit|debits|withdrawal|withdrawals|withdrawal amount|money out|debit amount|charges?|retrait|retraits|d[ée]bit)$/],
  ['credit', /^(?:credit|credits|deposit|deposits|deposit amount|money in|credit amount|payments? ?(?:& )?credits?|d[ée]p[ôo]t|d[ée]p[ôo]ts|cr[ée]dit)$/],
  ['balance', /^(?:balance|running balance|solde)$/],
  ['category', /^(?:category|cat[ée]gorie|merchant category)$/],
  ['type', /^(?:type|transaction type|type of transaction|credit\/debit|debit\/credit|transaction|dr\/cr)$/],
  ['currency', /^(?:currency|devise)$/],
  ['ignore', /^(?:account|account number|account type|card|card no\.?|card number|card #|card member|cardmember|item #|item|cheque number|check number|reference|reference number|status|filter|usd\$?|foreign amount|exchange rate)$/]
];

const roleFor = (header) => {
  const h = String(header || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const hit = ROLE_TESTS.find(([, re]) => re.test(h));
  return hit ? hit[0] : null;
};

const findHeaderRow = (rows) => {
  let best = { index: -1, score: 0 };
  rows.slice(0, 25).forEach((row, index) => {
    const roles = row.map(roleFor);
    const has = (r) => roles.includes(r);
    const score = roles.filter(Boolean).length;
    const usable = (has('date') || has('postedDate')) && (has('amount') || has('debit') || has('credit'));
    if (usable && score > best.score) best = { index, score };
  });
  return best.index;
};

const mapFromHeader = (header) => {
  const map = {};
  header.forEach((h, i) => {
    const role = roleFor(h);
    if (!role || role === 'ignore') return;
    if (role === 'description' && map.description !== undefined) { if (map.description2 === undefined) map.description2 = i; return; }
    if (map[role] === undefined) map[role] = i;
  });
  if (map.date === undefined && map.postedDate !== undefined) map.date = map.postedDate;
  if (map.description === undefined) {
    if (map.description2 !== undefined) { map.description = map.description2; delete map.description2; } else if (map.type !== undefined) { map.description = map.type; delete map.type; }
  }
  return map;
};

// No header row (TD, CIBC, older Scotiabank exports): infer from the data.
const inferColumns = (rows) => {
  const sample = rows.slice(0, 80);
  const width = Math.max(...sample.map((r) => r.length));
  const stats = Array.from({ length: width }, (_, i) => {
    const values = sample.map((r) => r[i] ?? '').filter((v) => v !== '');
    return {
      i,
      filled: values.length / sample.length,
      date: values.length ? values.filter((v) => parseDate(v)).length / values.length : 0,
      num: values.length ? values.filter((v) => parseMoney(v) !== null).length / values.length : 0,
      len: values.length ? values.reduce((s, v) => s + v.length, 0) / values.length : 0
    };
  });
  const dateCol = stats.find((s) => s.date > 0.8);
  const nums = stats.filter((s) => s !== dateCol && s.num > 0.9 && s.filled > 0.05);
  const texts = stats.filter((s) => s !== dateCol && !nums.includes(s) && s.filled > 0.5);
  const map = {};
  if (dateCol) map.date = dateCol.i;
  const byLen = [...texts].sort((a, b) => b.len - a.len);
  if (byLen[0]) map.description = byLen[0].i;
  if (byLen[1]) map.description2 = byLen[1].i;
  if (nums.length >= 2) {
    const [a, b] = nums;
    const both = sample.filter((r) => (r[a.i] ?? '') !== '' && (r[b.i] ?? '') !== '').length;
    if (both / sample.length < 0.1) { map.debit = a.i; map.credit = b.i; } else { map.amount = a.i; }
  } else if (nums[0]) map.amount = nums[0].i;
  return map;
};

// ------------------------------------------------------ Bank detection ----

export const detectBank = ({ header = [], filename = '', ofxOrg = '', width = 0 }) => {
  const h = header.map((x) => String(x).toLowerCase().trim());
  const f = filename.toLowerCase();
  const has = (x) => h.includes(x);
  const org = ofxOrg.toUpperCase();
  const fromOrg = [['ROYAL BANK', 'RBC'], ['RBC', 'RBC'], ['TD ', 'TD'], ['TORONTO-DOMINION', 'TD'], ['SCOTIA', 'Scotiabank'], ['CIBC', 'CIBC'], ['BMO', 'BMO'], ['BANK OF MONTREAL', 'BMO'], ['TANGERINE', 'Tangerine'], ['SIMPLII', 'Simplii'], ['AMEX', 'Amex'], ['AMERICAN EXPRESS', 'Amex'], ['CAPITAL ONE', 'Capital One'], ['DESJARDINS', 'Desjardins'], ['NATIONAL BANK', 'National Bank'], ['PC FINANCIAL', 'PC Financial'], ['ROGERS', 'Rogers Bank'], ['EQ BANK', 'EQ Bank'], ['WEALTHSIMPLE', 'Wealthsimple'], ['MBNA', 'MBNA'], ['TRIANGLE', 'Triangle']]
    .find(([k]) => org.includes(k));
  if (fromOrg) return fromOrg[1];
  if (has('description 1') && (has('cad$') || has('usd$'))) return 'RBC';
  if (has('date processed') || has('cardmember') || has('card member')) return 'Amex';
  if (has('card no.') && has('debit') && has('credit')) return 'Capital One';
  if (has('item #') && has('transaction amount')) return 'BMO';
  if (has('transaction') && has('name') && has('memo')) return 'Tangerine';
  if (has('sub-description') || has('type of transaction')) return 'Scotiabank';
  const fromName = [['tangerine', 'Tangerine'], ['amex', 'Amex'], ['accountactivity', 'TD'], ['cibc', 'CIBC'], ['rbc', 'RBC'], ['csv38', 'RBC'], ['scotia', 'Scotiabank'], ['bmo', 'BMO'], ['simplii', 'Simplii'], ['capitalone', 'Capital One'], ['wealthsimple', 'Wealthsimple'], ['eq', 'EQ Bank']]
    .find(([k]) => f.includes(k));
  if (fromName) return fromName[1];
  if (!header.length && width === 5) return 'TD';
  if (!header.length && width === 4) return 'CIBC';
  return '';
};

// ---------------------------------------------------------------- OFX ----

const ofxField = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim().replace(/&amp;/g, '&') : '';
};

export const isOfx = (text) => /<OFX>|OFXHEADER|<STMTTRN>/i.test(String(text).slice(0, 4000));

const parseOfx = (text) => {
  const blocks = String(text).match(/<STMTTRN>[\s\S]*?(?=<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>)/gi) || [];
  const org = ofxField(text, 'ORG');
  const isCard = /<CCACCTFROM>|<CCSTMTRS>/i.test(text);
  const rows = blocks.map((b) => {
    const amount = parseMoney(ofxField(b, 'TRNAMT'));
    const name = ofxField(b, 'NAME');
    const memo = ofxField(b, 'MEMO');
    return {
      date: parseDate(ofxField(b, 'DTPOSTED') || ofxField(b, 'DTUSER')),
      signed: amount,
      description: name || memo,
      extra: name && memo && memo !== name ? memo : '',
      fitId: ofxField(b, 'FITID'),
      bankCategory: ''
    };
  });
  // OFX spec: negative = money out, for bank and card accounts alike.
  return { rows, org, isCard, expenseSign: -1, format: 'OFX' };
};

// --------------------------------------------------------- Main parse ----

const PAYMENT_RE = /PAYMENT\s*[-–]?\s*THANK\s*YOU|PAIEMENT\s*[-–]?\s*MERCI|PAYMENT\s+RECEIVED|PAYMENT\s+-\s+RECEIVED|AUTO-?\s?PAY|PAYMENT FROM|^PAYMENT$|^PAIEMENT$|ONLINE (?:BANKING )?PAYMENT|(?:VISA|MASTERCARD|MC|AMEX|AMERICAN EXPRESS|CREDIT CARD|CC|CARD)\s*(?:PREAUTH(?:ORIZED)?\s*)?(?:PYMT|PMT|PAYMENT|PAY)\b|(?:PYMT|PMT|PAYMENT)\s*(?:TO|-)?\s*(?:VISA|MASTERCARD|AMEX|AMERICAN EXPRESS|CAPITAL ONE|MBNA|ROGERS BANK|PC FINANCIAL|TRIANGLE|TANGERINE CC|SCOTIA ?(?:VISA|CARD)|CIBC ?(?:VISA|MC)|TD ?VISA|RBC ?(?:VISA|MC)|BMO ?MC)|BILL PAYMENT.*(?:VISA|MASTERCARD|AMEX|AMERICAN EXPRESS|CAPITAL ONE|MBNA|CREDIT CARD)|CARD\/LOC PAY|CREDIT CARD\/LOC|^MB-CREDIT CARD/;
const TRANSFER_RE = /^(?:TFR|TRF|WWW TRF|TRANSFER|INTERNET TRANSFER|ONLINE TRANSFER|MOBILE TRANSFER|MB-TRANSFER|PTS TO|PTS FRM|SWEEP)\b|TRANSFER (?:TO|FROM) (?:SAVINGS|CHEQUING|CHECKING|ACCOUNT|\d)|VIREMENT (?:ENTRE|À|DE) (?:COMPTES?|ÉPARGNE)/;

export const classifyDescription = (raw) => {
  const s = String(raw || '').toUpperCase();
  if (PAYMENT_RE.test(s)) return 'card-payment';
  if (TRANSFER_RE.test(s)) return 'transfer';
  return null;
};

// Parse one file into normalised rows. `options` may carry user overrides:
// { dateOrder, flip, columns }.
export const parseStatement = (text, filename = '', options = {}) => {
  const warnings = [];
  let format = 'CSV';
  let raw;
  let header = [];
  let map = {};
  let signature;
  let expenseSign = null;
  let width = 0;
  let org = '';
  let isCard = false;

  if (isOfx(text)) {
    const ofx = parseOfx(text);
    raw = ofx.rows;
    format = ofx.format;
    org = ofx.org;
    isCard = ofx.isCard;
    expenseSign = ofx.expenseSign;
    signature = `ofx:${org || 'bank'}`;
  } else {
    const rows = parseCsv(text);
    if (!rows.length) return { error: 'This file is empty.' };
    const headerIndex = findHeaderRow(rows);
    let body;
    if (headerIndex >= 0) {
      header = rows[headerIndex];
      map = mapFromHeader(header);
      body = rows.slice(headerIndex + 1);
    } else {
      body = rows.filter((r) => r.length >= 3);
      map = inferColumns(body);
    }
    if (options.columns) map = { ...map, ...options.columns };
    width = Math.max(0, ...body.slice(0, 20).map((r) => r.length));
    signature = header.length ? `csv:${header.map((h) => h.toLowerCase().trim()).join('|')}` : `csv:headerless:${width}`;
    if (map.date === undefined || (map.amount === undefined && map.debit === undefined && map.credit === undefined)) {
      return { error: "Couldn't find the date and amount columns in this file.", header, sampleRows: body.slice(0, 5), signature };
    }
    const dates = body.map((r) => r[map.date]);
    const order = options.dateOrder || detectDateOrder(dates).order;
    const ambiguousDates = !options.dateOrder && detectDateOrder(dates).ambiguous;
    raw = body.map((r) => {
      let signed = null;
      if (map.amount !== undefined) signed = parseMoney(r[map.amount]);
      if (signed === null && (map.debit !== undefined || map.credit !== undefined)) {
        const debit = map.debit !== undefined ? parseMoney(r[map.debit]) : null;
        const credit = map.credit !== undefined ? parseMoney(r[map.credit]) : null;
        if (debit) signed = -Math.abs(debit);
        else if (credit) signed = Math.abs(credit);
      }
      // Some exports put "Debit"/"Credit" in a type column next to an unsigned amount.
      if (signed !== null && map.type !== undefined && map.amount !== undefined) {
        const t = String(r[map.type] || '').toUpperCase();
        if (/^(DEBIT|DR|D|WITHDRAWAL|PURCHASE)$/.test(t)) signed = -Math.abs(signed);
        if (/^(CREDIT|CR|C|DEPOSIT)$/.test(t)) signed = Math.abs(signed);
      }
      const desc = r[map.description] ?? '';
      return {
        date: parseDate(r[map.date], order),
        signed,
        description: desc,
        extra: map.description2 !== undefined ? (r[map.description2] || '') : '',
        bankCategory: map.category !== undefined ? (r[map.category] || '') : ''
      };
    });
    if (map.amount === undefined) expenseSign = -1; // debit/credit columns were normalised above
    if (ambiguousDates) warnings.push('dates-ambiguous');
    width = width || 0;
    raw.dateOrder = order;
  }

  const rows = raw.filter((r) => r.date && r.signed !== null && r.signed !== 0 && (r.description || r.extra));
  const dropped = raw.length - rows.length;

  // Which sign means "money out"? Card exports often show purchases as
  // positive numbers. Use the majority sign, ignoring card payments.
  let inferred = expenseSign;
  if (inferred === null) {
    const counted = rows.filter((r) => !classifyDescription(`${r.description} ${r.extra}`));
    const neg = counted.filter((r) => r.signed < 0).length;
    const pos = counted.length - neg;
    // Ties (tiny files) fall back to the most common convention: negative = spent.
    inferred = pos > neg ? 1 : -1;
  }
  const outSign = options.flip ? -inferred : inferred;

  const occurrences = new Map();
  const normalised = rows.map((r, index) => {
    const description = [r.description, r.extra].filter(Boolean).join(' ').trim();
    const mainText = r.description || r.extra;
    const direction = Math.sign(r.signed) === outSign ? 'out' : 'in';
    const amount = roundMoney(Math.abs(r.signed));
    const key = merchantKey(mainText) || merchantKey(description);
    const occKey = `${r.date}|${amount}|${direction}|${key}`;
    const occurrence = (occurrences.get(occKey) || 0) + 1;
    occurrences.set(occKey, occurrence);
    return {
      index,
      date: r.date,
      amount,
      direction,
      raw: description,
      merchant: cleanMerchant(mainText) || cleanMerchant(description),
      key,
      bankCategory: r.bankCategory || '',
      fitId: r.fitId || '',
      occurrence
    };
  });

  const days = normalised.map((r) => r.date).sort();
  return {
    format,
    signature,
    bank: detectBank({ header, filename, ofxOrg: org, width }),
    isCard,
    header,
    columns: map,
    dateOrder: raw.dateOrder || null,
    expenseSignInferred: inferred,
    flipped: !!options.flip,
    rows: normalised,
    dropped,
    from: days[0] || null,
    to: days[days.length - 1] || null,
    warnings
  };
};

// ---------------------------------------------------- Classification ----

const slug = (s) => String(s || 'card').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'card';

export const fingerprintFor = (account, row) => (row.fitId
  ? `${slug(account)}|fit|${row.fitId}`
  : `${slug(account)}|${row.date}|${row.amount.toFixed(2)}|${row.direction}|${row.key}|${row.occurrence}`);

const looseFingerprint = (fp) => fp.split('|').slice(1).join('|');

const dayDiff = (a, b) => Math.round((dateFromDayKey(a) - dateFromDayKey(b)) / 86400000);

// files: [{ id, account, parsed }]
// Returns review items. Each item can be toggled / re-categorised in the UI.
export const buildReview = ({ files, state, now = new Date() }) => {
  const { categories, transactions } = state;
  const rules = state.importRules || [];
  const history = historyIndex(transactions);
  const existingIds = new Set(transactions.filter((t) => t.importId).map((t) => t.importId));
  const existingLoose = new Set(transactions.filter((t) => t.importId && !t.importId.includes('|fit|')).map((t) => looseFingerprint(t.importId)));
  const manual = transactions.filter((t) => !t.importId && t.categoryId !== 'system' && (t.type === 'expense' || t.type === 'income' || !t.type));
  const usedManual = new Set();
  const seen = new Set();
  const outKeys = new Set();
  files.forEach((f) => f.parsed.rows.forEach((r) => { if (r.direction === 'out') outKeys.add(r.key); }));
  const today = localDayKey(now);

  const items = [];
  files.forEach((file) => {
    file.parsed.rows.forEach((row) => {
      const fingerprint = fingerprintFor(file.account, row);
      const item = {
        id: `${file.id}:${row.index}`,
        fileId: file.id,
        account: file.account,
        ...row,
        fingerprint,
        kind: row.direction === 'out' ? 'expense' : 'income',
        categoryId: null,
        suggestion: null,
        include: false,
        status: 'ready',
        reason: '',
        matchTxId: null,
        historyOnly: false,
        future: row.date > today
      };

      const special = classifyDescription(row.raw);
      if (seen.has(fingerprint)) {
        item.status = 'skipped'; item.reason = 'Duplicate row in these files';
      } else if (existingIds.has(fingerprint) || (!row.fitId && existingLoose.has(looseFingerprint(fingerprint)))) {
        item.status = 'skipped'; item.reason = 'Already imported';
      } else if (special === 'card-payment') {
        item.status = 'skipped'; item.reason = 'Card payment'; item.kind = 'payment';
      } else if (special === 'transfer') {
        item.status = 'skipped'; item.reason = 'Transfer between your accounts'; item.kind = 'payment';
      }
      seen.add(fingerprint);

      if (item.status !== 'skipped') {
        // Something you already logged by hand (or via Apple Pay)?
        const wantType = row.direction === 'out' ? 'expense' : 'income';
        const candidates = manual
          .filter((t) => !usedManual.has(t.id) && (t.type || 'expense') === wantType && Math.abs((Number(t.amount) || 0) - row.amount) < 0.01)
          .map((t) => ({ t, diff: dayDiff(row.date, localDayKey(t.date)), same: merchantKey(t.originalDescription || t.description) === row.key }))
          .filter((c) => c.diff >= -1 && c.diff <= 5)
          .sort((a, b) => (b.same - a.same) || Math.abs(a.diff) - Math.abs(b.diff));
        if (candidates[0]) {
          const { t } = candidates[0];
          usedManual.add(t.id);
          item.status = 'skipped';
          item.reason = `Matches your entry “${t.description}”`;
          item.matchTxId = t.id;
        }
      }

      const suggestion = suggestCategory({ description: row.raw, bankCategory: row.bankCategory, categories, rules, history });
      if (suggestion?.skip && item.status !== 'skipped') {
        item.status = 'skipped'; item.reason = 'Your rule: always skip';
      }
      if (row.direction === 'in' && item.kind === 'income') {
        // Credits that look like refunds go back to the merchant's budget;
        // other deposits (pay, e-transfers) only if a rule says so.
        const looksLikeRefund = outKeys.has(row.key) || history.has(row.key) || suggestion?.source === 'rule'
          || /\b(?:REFUND|RETURN|REMBOURSEMENT|CREDIT VOUCHER|REVERSAL)\b/i.test(row.raw);
        item.kind = looksLikeRefund ? 'refund' : 'income';
      }
      if (suggestion && !suggestion.skip && (item.kind !== 'income' || suggestion.source === 'rule')) {
        item.suggestion = suggestion;
        item.categoryId = suggestion.categoryId;
      }
      if (item.status !== 'skipped') {
        if (!item.categoryId) item.status = item.kind === 'income' ? 'deposit' : 'needs';
        item.include = !!item.categoryId;
      }
      const category = categories.find((c) => c.id === item.categoryId);
      item.historyOnly = !!category && dateFromDayKey(row.date) < periodStartFor(category, state.cycleStartDate);
      items.push(item);
    });
  });
  return items.sort((a, b) => b.date.localeCompare(a.date) || a.merchant.localeCompare(b.merchant));
};

// Recompute derived flags after the user picks a budget in the review.
export const assignCategory = (item, categoryId, state) => {
  const category = state.categories.find((c) => c.id === categoryId);
  return {
    ...item,
    categoryId,
    include: !!categoryId,
    status: item.status === 'skipped' ? item.status : categoryId ? 'ready' : item.kind === 'income' ? 'deposit' : 'needs',
    historyOnly: !!category && dateFromDayKey(item.date) < periodStartFor(category, state.cycleStartDate)
  };
};

export const buildImportTransactions = (items, state, batchId = newId()) => {
  const importedAt = new Date().toISOString();
  return items
    .filter((it) => it.include && it.categoryId)
    .map((it) => {
      const category = state.categories.find((c) => c.id === it.categoryId);
      if (!category) return null;
      const date = dateFromDayKey(it.date);
      return buildTransaction({
        type: it.direction === 'out' ? 'expense' : 'income',
        amount: it.amount,
        description: it.merchant || it.raw,
        category,
        date: date.toISOString(),
        tags: [],
        extra: {
          importId: it.fingerprint,
          importBatch: batchId,
          importedAt,
          source: 'import',
          account: it.account,
          originalDescription: it.raw,
          ...(it.historyOnly ? { affectsBalance: false } : {})
        }
      });
    })
    .filter(Boolean);
};

export const summarise = (items) => {
  const included = items.filter((i) => i.include && i.categoryId);
  return {
    total: items.length,
    included: included.length,
    needs: items.filter((i) => i.status === 'needs').length,
    deposits: items.filter((i) => i.status === 'deposit').length,
    skipped: items.filter((i) => i.status === 'skipped').length,
    spend: roundMoney(included.filter((i) => i.direction === 'out').reduce((s, i) => s + i.amount, 0)),
    credits: roundMoney(included.filter((i) => i.direction === 'in').reduce((s, i) => s + i.amount, 0)),
    historyOnly: included.filter((i) => i.historyOnly).length
  };
};

export const suggestAccountLabel = (parsed, filename = '') => {
  if (parsed.bank) {
    const cardOnly = /^(Amex|Capital One|MBNA|Triangle|Rogers Bank)$/.test(parsed.bank);
    return parsed.isCard && !cardOnly ? `${parsed.bank} card` : parsed.bank;
  }
  const stem = filename.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
  return stem && stem.length <= 24 && !/^\d+$/.test(stem) ? stem : 'Card';
};
