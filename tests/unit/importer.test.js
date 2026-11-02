import { describe, it, expect } from 'vitest';
import {
  parseCsv, parseDate, parseMoney, parseStatement, buildReview, buildImportTransactions, assignCategory, summarise, classifyDescription, suggestAccountLabel
} from '../../app/src/lib/importer.js';
import { cleanMerchant, merchantKey, suggestCategory, learnRule, conceptForText } from '../../app/src/lib/merchants.js';
import { normalizeState } from '../../app/src/lib/storage.js';
import { addTransactions, buildTransaction, removeTransaction } from '../../app/src/lib/transactions.js';
import { periodStartFor } from '../../app/src/lib/cycle.js';
import { localDayKey } from '../../app/src/lib/dates.js';

import { SAMPLES } from '../fixtures/statements.js';

const categories = [
  { id: 'g', name: 'Grocery', limit: 100, balance: 100, icon: 'apple', frequency: 'weekly' },
  { id: 'c', name: 'Coffee', limit: 20, balance: 20, icon: 'coffee', frequency: 'weekly' },
  { id: 't', name: 'Transport', limit: 50, balance: 50, icon: 'bus', frequency: 'weekly' },
  { id: 'f', name: 'Fun', limit: 80, balance: 80, icon: 'gamepad-2', frequency: 'weekly' },
  { id: 's', name: 'Shopping', limit: 120, balance: 120, icon: 'shopping-bag', frequency: 'weekly' },
  { id: 'r', name: 'Rent', limit: 1500, balance: 1500, icon: 'home', frequency: 'monthly' }
];
const stateWith = (over = {}) => normalizeState({ categories, transactions: [], cycleStartDate: new Date(2026, 9, 25).toISOString(), ...over });
const NOW = new Date(2026, 10, 1, 20);

describe('csv + values', () => {
  it('parses quoted CSV with commas, quotes and semicolons', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
    expect(parseCsv('x;y\n1,5;2')).toEqual([['x', 'y'], ['1,5', '2']]);
  });
  it('parses dates in bank formats', () => {
    expect(parseDate('10/28/2026')).toBe('2026-10-28');
    expect(parseDate('28/10/2026', 'DMY')).toBe('2026-10-28');
    expect(parseDate('2026-10-28')).toBe('2026-10-28');
    expect(parseDate('20261028')).toBe('2026-10-28');
    expect(parseDate('30 Oct. 2026')).toBe('2026-10-30');
    expect(parseDate('Oct 30, 2026')).toBe('2026-10-30');
    expect(parseDate('30 octobre 2026')).toBe('2026-10-30');
    expect(parseDate('13/13/2026')).toBeNull();
  });
  it('parses money in bank formats', () => {
    expect(parseMoney('$1,234.56')).toBe(1234.56);
    expect(parseMoney('(12.34)')).toBe(-12.34);
    expect(parseMoney('12.34-')).toBe(-12.34);
    expect(parseMoney('1 234,56 $')).toBe(1234.56);
    expect(parseMoney('-54,20')).toBe(-54.2);
    expect(parseMoney('12.00 CR')).toBe(-12);
    expect(parseMoney('abc')).toBeNull();
  });
});

describe('statement formats', () => {
  const out = (p) => p.rows.filter((r) => r.direction === 'out').map((r) => r.amount);
  it('RBC: header with Description 1/2 and CAD$', () => {
    const p = parseStatement(SAMPLES.rbc, 'csv38291.csv');
    expect(p.bank).toBe('RBC');
    expect(p.rows).toHaveLength(4);
    expect(out(p)).toEqual([4.25, 350, 62.18]);
    expect(p.rows[0].merchant).toBe('Tim Hortons');
    expect(p.rows[1].direction).toBe('in');
  });
  it('TD: no header, debit/credit/balance columns', () => {
    const p = parseStatement(SAMPLES.td, 'accountactivity.csv');
    expect(p.bank).toBe('TD');
    expect(out(p)).toEqual([4.25, 3.3, 200, 4.25]);
    expect(p.rows.find((r) => r.merchant === 'Amazon').direction).toBe('in');
  });
  it('Amex: positive charges, text dates', () => {
    const p = parseStatement(SAMPLES.amex, 'Summary.csv');
    expect(p.bank).toBe('Amex');
    expect(p.expenseSignInferred).toBe(1);
    expect(out(p)).toEqual([32.4, 16.49]);
  });
  it('Capital One: debit/credit with bank categories', () => {
    const p = parseStatement(SAMPLES.capitalOne);
    expect(p.bank).toBe('Capital One');
    expect(p.rows[0]).toMatchObject({ amount: 45, direction: 'out', bankCategory: 'Gas/Automotive', merchant: 'Shell' });
  });
  it('Tangerine: name + memo', () => {
    const p = parseStatement(SAMPLES.tangerine);
    expect(p.bank).toBe('Tangerine');
    const farm = p.rows.find((r) => r.raw.includes('FARM BOY'));
    expect(farm.direction).toBe('out');
    expect(farm.amount).toBe(41.1);
  });
  it('CIBC: no header, ISO dates', () => {
    const p = parseStatement(SAMPLES.cibc, 'cibc.csv');
    expect(out(p)).toEqual([11.99, 38.45]);
  });
  it('BMO: compact dates, positive purchases', () => {
    const p = parseStatement(SAMPLES.bmo);
    expect(p.bank).toBe('BMO');
    expect(p.rows.map((r) => r.date)).toEqual(['2026-10-30', '2026-10-29', '2026-10-28']);
    expect(out(p)).toEqual([23.1, 8.75]);
  });
  it('French day-first CSV with decimal commas', () => {
    const p = parseStatement(SAMPLES.frenchDmy);
    expect(p.dateOrder).toBe('DMY');
    expect(p.rows[0]).toMatchObject({ date: '2026-10-30', amount: 54.2, direction: 'out' });
  });
  it('OFX/QFX with FITIDs', () => {
    const p = parseStatement(SAMPLES.ofx, 'statement.qfx');
    expect(p.format).toBe('OFX');
    expect(p.bank).toBe('Scotiabank');
    expect(p.isCard).toBe(true);
    expect(p.rows[0]).toMatchObject({ amount: 18.75, direction: 'out', fitId: 'A1', date: '2026-10-30' });
    expect(suggestAccountLabel(p)).toBe('Scotiabank card');
  });
  it('lets the user flip signs', () => {
    const p = parseStatement(SAMPLES.amex, 'a.csv', { flip: true });
    expect(p.rows.find((r) => r.raw.startsWith('NETFLIX')).direction).toBe('in');
  });
  it('reports files it cannot read', () => {
    expect(parseStatement('hello,world\nfoo,bar').error).toBeTruthy();
  });
});

describe('merchants and categories', () => {
  it('cleans descriptors', () => {
    expect(cleanMerchant('POS PURCHASE LOBLAWS 1029 TORONTO ON')).toBe('Loblaws');
    expect(cleanMerchant('SQ *PILOT COFFEE ROASTE')).toBe('Pilot Coffee Roaste');
    expect(cleanMerchant('THE KEG STEAKHOUSE NORTH YORK ON')).toBe('The Keg Steakhouse');
    expect(merchantKey('TIM HORTONS #1234 TORONTO ON')).toBe(merchantKey('TIM HORTONS #9876 OTTAWA ON'));
  });
  it('guesses concepts without false word matches', () => {
    expect(conceptForText('RENT JAN')).toBe('housing');
    expect(conceptForText('PARENT COUNCIL')).toBeNull();
    expect(conceptForText('UBER EATS')).toBe('dining');
  });
  it('prefers rules, then history, then guesses', () => {
    const rules = learnRule([], { key: 'TIM HORTONS', categoryId: 'f' });
    expect(suggestCategory({ description: 'TIM HORTONS #1', categories, rules }).categoryId).toBe('f');
    expect(suggestCategory({ description: 'TIM HORTONS #1', categories, rules: [] })).toMatchObject({ categoryId: 'c', source: 'guess' });
    const history = new Map([['TIM HORTONS', 'g']]);
    expect(suggestCategory({ description: 'TIM HORTONS #1', categories, history }).source).toBe('history');
    const contains = [{ id: 'x', mode: 'contains', match: 'E-TRANSFER', categoryId: 'r', action: 'categorize' }];
    expect(suggestCategory({ description: 'INTERAC E-TRANSFER TO J', categories, rules: contains }).categoryId).toBe('r');
  });
});

describe('review', () => {
  const file = (key, account, opts) => ({ id: key, account, parsed: parseStatement(SAMPLES[key], `${key}.csv`, opts) });

  it('categorises, skips payments and keeps deposits out by default', () => {
    const items = buildReview({ files: [file('rbc', 'RBC chequing')], state: stateWith(), now: NOW });
    const by = (m) => items.find((i) => i.raw.includes(m));
    expect(by('TIM HORTONS')).toMatchObject({ categoryId: 'c', include: true, status: 'ready' });
    expect(by('LOBLAWS')).toMatchObject({ categoryId: 'g', include: true });
    expect(by('PAYMENT - VISA')).toMatchObject({ status: 'skipped', reason: 'Card payment', include: false });
    expect(by('PAYROLL')).toMatchObject({ status: 'deposit', include: false });
  });

  it('treats card credits from known merchants as refunds', () => {
    const items = buildReview({ files: [file('amex', 'Amex')], state: stateWith(), now: NOW });
    const refund = items.find((i) => i.direction === 'in' && i.raw.includes('UBER'));
    expect(refund.kind).toBe('refund');
    expect(refund.include).toBe(true);
  });

  it('skips rows already imported and duplicates across files, but keeps same-day repeats', () => {
    const state = stateWith();
    const first = buildReview({ files: [file('td', 'TD')], state, now: NOW });
    const txs = buildImportTransactions(first, state);
    const after = addTransactions(state, txs);
    const again = buildReview({ files: [file('td', 'TD'), { ...file('td', 'TD'), id: 'td2' }], state: after, now: NOW });
    expect(again.filter((i) => i.include)).toHaveLength(0);
    expect(again.every((i) => i.status === 'skipped')).toBe(true);
    // Two identical Tim Hortons rows on different days both import.
    expect(txs.filter((t) => t.description === 'Tim Hortons')).toHaveLength(2);
  });

  it('matches entries you already typed in (or logged with Apple Pay)', () => {
    let state = stateWith();
    state = addTransactions(state, [buildTransaction({ type: 'expense', amount: 32.4, description: 'Dinner', category: categories[3], date: new Date(2026, 9, 30, 19).toISOString() })]);
    const items = buildReview({ files: [file('amex', 'Amex')], state, now: NOW });
    const uber = items.find((i) => i.amount === 32.4);
    expect(uber.status).toBe('skipped');
    expect(uber.reason).toContain('Dinner');
  });

  it('applies skip rules and learned rules', () => {
    const rules = learnRule(learnRule([], { key: merchantKey('NETFLIX.COM'), categoryId: 'f' }), { key: merchantKey('UBER EATS'), categoryId: null, action: 'skip' });
    const items = buildReview({ files: [file('amex', 'Amex')], state: stateWith({ importRules: rules }), now: NOW });
    expect(items.find((i) => i.raw.startsWith('NETFLIX'))).toMatchObject({ categoryId: 'f', include: true });
    expect(items.find((i) => i.amount === 32.4)).toMatchObject({ status: 'skipped', reason: 'Your rule: always skip' });
  });

  it('keeps older entries as history without touching current balances', () => {
    const state = stateWith({ cycleStartDate: new Date(2026, 10, 1).toISOString() });
    const items = buildReview({ files: [file('rbc', 'RBC')], state, now: NOW });
    const tim = items.find((i) => i.raw.includes('TIM'));
    expect(tim.historyOnly).toBe(true);
    const txs = buildImportTransactions(items, state);
    const after = addTransactions(state, txs);
    expect(after.categories.find((c) => c.id === 'c').balance).toBe(20);
    expect(after.transactions.find((t) => t.description === 'Tim Hortons').affectsBalance).toBe(false);
    // Deleting a history-only entry also leaves balances alone.
    const tx = after.transactions.find((t) => t.description === 'Tim Hortons');
    expect(removeTransaction(after, tx.id).categories.find((c) => c.id === 'c').balance).toBe(20);
  });

  it('assigning a budget includes the row; summary counts it', () => {
    const state = stateWith();
    const items = buildReview({ files: [file('tangerine', 'Tangerine')], state, now: NOW });
    // "Rent share" e-Transfer is recognised; interest is a deposit until you pick a budget.
    expect(items.find((i) => i.raw.includes('e-Transfer'))).toMatchObject({ categoryId: 'r', status: 'ready' });
    const interest = items.find((i) => i.raw.includes('Interest'));
    expect(interest).toMatchObject({ status: 'deposit', include: false });
    const fixed = assignCategory(interest, 's', state);
    expect(fixed).toMatchObject({ include: true, status: 'ready' });
    const s = summarise(items.map((i) => (i.id === fixed.id ? fixed : i)));
    expect(s.included).toBe(items.filter((i) => i.include).length + 1);
  });

  it('builds tagged transactions with fingerprints', () => {
    const state = stateWith();
    const items = buildReview({ files: [file('capitalOne', 'Capital One')], state, now: NOW });
    const txs = buildImportTransactions(items, state, 'batch1');
    const shell = txs.find((t) => t.description === 'Shell');
    expect(shell).toMatchObject({ account: 'Capital One', source: 'import', importBatch: 'batch1', categoryId: 't', type: 'expense', amount: 45 });
    expect(localDayKey(shell.date)).toBe('2026-10-30');
    expect(shell.importId).toMatch(/^capital-one\|2026-10-30\|45\.00\|out\|/);
  });
});

describe('helpers', () => {
  it('finds the monthly period start', () => {
    const start = new Date(2026, 10, 15); // Sun Nov 15
    expect(localDayKey(periodStartFor({ frequency: 'monthly' }, start))).toBe('2026-11-01');
    expect(localDayKey(periodStartFor({ frequency: 'weekly' }, start))).toBe('2026-11-15');
  });
  it('classifies payments and transfers', () => {
    expect(classifyDescription('PAYMENT THANK YOU/PAIEMENT MERCI')).toBe('card-payment');
    expect(classifyDescription('TD VISA PREAUTH PYMT')).toBe('card-payment');
    expect(classifyDescription('TRSF FROM/DE ACCT/CPT 1234')).toBe(null);
    expect(classifyDescription('INTERAC E-TRANSFER TO J SMITH')).toBe(null);
    expect(classifyDescription('WWW TRF DDA - 1234')).toBe('transfer');
  });
});

describe('Apple Pay quick-add links', () => {
  // Imported lazily so this file still documents the importer first.
  it('parses Shortcuts-style links', async () => {
    const { parseQuickAdd } = await import('../../app/src/lib/quickadd.js');
    expect(parseQuickAdd('auto=1&amount=CA%246.45&merchant=Tim%20Hortons&card=Amex%20Cobalt')).toMatchObject({ amount: 6.45, merchant: 'Tim Hortons', card: 'Amex Cobalt', auto: true, type: 'expense' });
    expect(parseQuickAdd('amount=6,45%20%24&merchant=A%26W')).toMatchObject({ amount: 6.45, merchant: 'A&W', auto: false });
    expect(parseQuickAdd('merchant=x')).toBeNull();
  });
  it('logs known merchants automatically, asks for new ones, ignores double fires', async () => {
    const { parseQuickAdd, planQuickAdd } = await import('../../app/src/lib/quickadd.js');
    let state = stateWith();
    const known = planQuickAdd(parseQuickAdd('auto=1&amount=4.25&merchant=Starbucks&card=Visa'), state);
    expect(known.action).toBe('add');
    expect(known.transaction).toMatchObject({ categoryId: 'c', amount: 4.25, source: 'applepay', account: 'Visa', description: 'Starbucks' });
    state = addTransactions(state, [known.transaction]);
    expect(planQuickAdd(parseQuickAdd('auto=1&amount=4.25&merchant=Starbucks'), state).action).toBe('duplicate');
    const unknown = planQuickAdd(parseQuickAdd('auto=1&amount=19&merchant=Zorblax%20Ltd'), state);
    expect(unknown.action).toBe('confirm');
    expect(unknown.addOptions.prefill).toMatchObject({ amount: 19, description: 'Zorblax Ltd' });
    // After you choose a budget once (a rule), it's automatic.
    const learned = { ...state, importRules: learnRule([], { key: merchantKey('Zorblax Ltd'), categoryId: 's' }) };
    expect(planQuickAdd(parseQuickAdd('auto=1&amount=19&merchant=Zorblax%20Ltd'), learned).action).toBe('add');
    // A later statement import recognises the Apple Pay entry.
    const items = buildReview({ files: [{ id: 'x', account: 'Visa', parsed: parseStatement('Date,Description,Amount\n' + localDayKey(new Date()) + ',STARBUCKS #123 TORONTO ON,-4.25') }], state });
    expect(items[0]).toMatchObject({ status: 'skipped' });
    expect(items[0].reason).toContain('Starbucks');
  });
});
