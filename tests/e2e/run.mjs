// End-to-end checks against the production build (`npm run build` first).
// Usage: npm run e2e            -> tests a local `vite preview` of dist/
//        npm run e2e -- <url>   -> tests a deployed URL (cloud sync stays off)
// Screenshots are written to tests/e2e/out/.

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { legacyStorage } from './fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const outDir = fileURLToPath(new URL('./out/', import.meta.url));
mkdirSync(outDir, { recursive: true });

const target = process.argv[2];
let server;
let base = target;
if (!base) {
  base = 'http://localhost:4174/';
  server = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 50; i += 1) {
    try { if ((await fetch(base)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 200));
  }
}

const results = [];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

const newPage = async ({ seed, viewport = { width: 390, height: 844 }, colorScheme = 'light' } = {}) => {
  const ctx = await browser.newContext({ viewport, colorScheme, deviceScaleFactor: 2, acceptDownloads: true, hasTouch: viewport.width < 900 });
  // Seed once per context (not on every reload).
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('__seeded')) return;
    localStorage.clear();
    Object.entries(s).forEach(([k, v]) => localStorage.setItem(k, v));
    sessionStorage.setItem('__seeded', '1');
  }, { cloud_sync: 'off', ...(seed || {}) });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  return page;
};

const test = async (name, fn) => {
  const started = Date.now();
  let page;
  try {
    page = await fn();
    if (page?.errors?.length) throw new Error(`Console errors: ${page.errors.join(' | ')}`);
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err.message });
    console.log(`  ✗ ${name}\n      ${err.message.split('\n')[0]}`);
    if (page) await page.screenshot({ path: `${outDir}FAIL-${name.replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {});
  } finally {
    if (page) await page.context().close().catch(() => {});
  }
};

const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const ls = (page, key) => page.evaluate((k) => localStorage.getItem(k), key);
const cats = async (page) => JSON.parse(await ls(page, 'cats_v33'));
const balance = async (page, name) => (await cats(page)).find((c) => c.name === name)?.balance;
const dialog = (page) => page.getByRole('dialog').last();
const go = async (page, route) => { await page.goto(`${base}#/${route}`); await page.waitForTimeout(300); };

const addEntry = async (page, { amount, category, note, type, day }) => {
  await page.getByRole('button', { name: 'Add transaction' }).click();
  const d = dialog(page);
  if (type) await d.getByRole('radio', { name: type, exact: true }).click();
  await d.getByLabel('Amount', { exact: true }).fill(String(amount));
  if (category) await d.getByRole('radio', { name: new RegExp(`^${category}`) }).click();
  if (note) await d.getByPlaceholder(/e\.g\./).first().fill(note);
  if (day) await d.getByRole('button', { name: day, exact: true }).click();
  await d.getByRole('button', { name: /^Add (expense|income)/ }).click();
};

console.log(`Testing ${base}`);

await test('onboarding sets name, currency and starter budgets', async () => {
  const page = await newPage();
  await page.goto(base);
  await page.getByPlaceholder('Your name (optional)').fill('Sam');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('radio', { name: '€' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Grocery budget').fill('80');
  await page.getByRole('button', { name: 'Remove Phone' }).click();
  await page.screenshot({ path: `${outDir}onboarding.png` });
  await page.getByRole('button', { name: 'Start budgeting' }).click();
  await page.getByText('Good', { exact: false }).first().waitFor();
  expect(await ls(page, 'currency') === '€', 'currency not saved');
  expect(await ls(page, 'onboarding_done_v2') === 'true', 'onboarding flag not saved');
  const c = await cats(page);
  expect(!c.some((x) => x.name === 'Phone'), 'Phone budget not removed');
  expect(c.find((x) => x.name === 'Grocery').limit === 80, 'Grocery limit not updated');
  expect(await page.getByText('€80').first().isVisible(), 'euro amounts not shown');
  return page;
});

await test('legacy data loads unchanged and is snapshotted', async () => {
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'home');
  await page.getByText('$157.50').first().waitFor({ timeout: 5000 });
  const firstRow = await page.locator('section').filter({ hasText: 'Budgets' }).getByRole('button', { name: /Add expense to/ }).first().getAttribute('aria-label');
  expect(firstRow === 'Add expense to Phone', `pinned budget should be first, got ${firstRow}`);
  expect(await balance(page, 'Coffee') === -4, 'legacy balance changed');
  expect(!!(await ls(page, 'bf_pre_v4_snapshot')), 'legacy snapshot missing');
  expect(!(await ls(page, 'bf_pre_v4_snapshot')).includes('gemini_key'), 'snapshot should not include AI key');
  await page.screenshot({ path: `${outDir}home-legacy.png`, fullPage: true });
  return page;
});

await test('add expense, undo, backdated income and quick spend', async () => {
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'home');
  // Type key by key (like a person) to catch focus being stolen mid-entry.
  await page.getByRole('button', { name: 'Add transaction' }).click();
  const sheet = dialog(page);
  await sheet.getByLabel('Amount', { exact: true }).pressSequentially('12.50', { delay: 30 });
  await sheet.getByRole('radio', { name: /^Grocery/ }).click();
  await sheet.getByPlaceholder('e.g. Coffee').click();
  await page.keyboard.type('Lunch', { delay: 80 });
  await page.waitForTimeout(150);
  expect(await sheet.getByPlaceholder('e.g. Coffee').inputValue() === 'Lunch', 'typing in the note field lost focus');
  expect(await sheet.getByLabel('Amount', { exact: true }).inputValue() === '12.50', 'amount changed while typing the note');
  await sheet.getByRole('button', { name: /^Add expense/ }).click();
  await page.getByRole('status').getByText('$12.50 spent on Grocery').waitFor();
  expect(await balance(page, 'Grocery') === 19, 'expense not applied');
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Grocery') === 31.5, 'undo did not restore balance');

  await addEntry(page, { amount: '40', category: 'Shopping', note: 'Refund', type: 'Income', day: 'Yesterday' });
  await page.waitForTimeout(200);
  expect(await balance(page, 'Shopping') === 105, 'income not applied');
  const tx = JSON.parse(await ls(page, 'tx_v33')).find((t) => t.description === 'Refund');
  const y = new Date(); y.setDate(y.getDate() - 1);
  expect(new Date(tx.date).getDate() === y.getDate(), 'backdated entry has wrong date');

  await page.getByRole('button', { name: 'Add expense to Shopping' }).click();
  const d = dialog(page);
  expect(await d.getByRole('radio', { name: /^Shopping/ }).getAttribute('aria-checked') === 'true', 'quick spend did not preselect budget');
  await d.getByRole('button', { name: '$5', exact: true }).click();
  await d.getByRole('button', { name: /^Add expense/ }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Shopping') === 100, 'quick spend not applied');
  return page;
});

await test('edit, delete and restore an entry from Activity', async () => {
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'activity');
  await page.getByRole('button', { name: /Groceries/ }).click();
  const d = dialog(page);
  await d.getByLabel('Amount').fill('50');
  await d.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Grocery') === 20, `edit not applied (${await balance(page, 'Grocery')})`);
  await page.getByRole('button', { name: /Groceries/ }).click();
  await dialog(page).getByRole('button', { name: 'Delete entry' }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Grocery') === 70, 'delete did not refund');
  await page.getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Grocery') === 20, 'restore failed');
  await page.getByLabel('Search activity').fill('costco');
  expect(await page.getByRole('button', { name: /Costco/ }).isVisible(), 'search failed');
  expect(!(await page.getByRole('button', { name: /Dinner out/ }).isVisible()), 'search did not filter');
  return page;
});

await test('move money and split an expense', async () => {
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'home');
  await page.getByRole('button', { name: 'Add transaction' }).click();
  let d = dialog(page);
  await d.getByRole('radio', { name: 'Move', exact: true }).click();
  const pickers = d.getByRole('radiogroup', { name: 'Category' });
  await pickers.nth(0).getByRole('radio', { name: /^Shopping/ }).click();
  await pickers.nth(1).getByRole('radio', { name: /^Coffee/ }).click();
  await d.getByPlaceholder('0.00').fill('10');
  await d.getByRole('button', { name: 'Move money' }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Coffee') === 6 && await balance(page, 'Shopping') === 55, 'transfer not applied');

  await page.getByRole('button', { name: 'Add transaction' }).click();
  d = dialog(page);
  await d.getByRole('radio', { name: 'Split', exact: true }).click();
  await d.getByPlaceholder('e.g. Costco run').fill('Market');
  await d.getByRole('radiogroup', { name: 'Budget for part 1' }).getByRole('radio', { name: 'Grocery' }).click();
  await d.getByLabel('Amount for part 1').fill('6');
  await d.getByRole('radiogroup', { name: 'Budget for part 2' }).getByRole('radio', { name: 'Shopping' }).click();
  await d.getByLabel('Amount for part 2').fill('4');
  await d.getByRole('button', { name: /^Save split/ }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Grocery') === 25.5 && await balance(page, 'Shopping') === 51, 'split not applied');
  return page;
});

await test('spending guards ask before saving', async () => {
  const page = await newPage({ seed: { ...legacyStorage(), daily_spend_limit: '30' } });
  await go(page, 'home');
  await addEntry(page, { amount: '50', category: 'Grocery' });
  await page.getByRole('dialog', { name: 'Daily limit' }).waitFor();
  await page.getByRole('dialog', { name: 'Daily limit' }).getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(200);
  expect(await balance(page, 'Grocery') === 31.5, 'expense saved despite cancel');
  return page;
});

await test('plan: goal deposit, bill paid, subscription renewal', async () => {
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'plan');
  await page.getByRole('button', { name: 'Deposit' }).click();
  await dialog(page).getByLabel('Amount').fill('50');
  await dialog(page).getByRole('button', { name: 'Deposit', exact: true }).click();
  await page.getByText('$500 of $2,000').first().waitFor();
  await page.getByRole('tab', { name: 'Bills' }).click();
  await page.getByRole('button', { name: 'Paid', exact: true }).first().click();
  await dialog(page).getByRole('button', { name: 'Mark paid' }).click();
  await page.waitForTimeout(200);
  expect(JSON.parse(await ls(page, 'bills_v2'))[0].lastPaidMonth, 'bill not marked paid');
  await page.getByRole('tab', { name: 'Subscriptions' }).click();
  const before = JSON.parse(await ls(page, 'subscriptions_v2'))[0].nextDue;
  await page.getByRole('button', { name: 'Paid', exact: true }).first().click();
  await dialog(page).getByRole('button', { name: 'Mark paid' }).click();
  await page.waitForTimeout(200);
  const sub = JSON.parse(await ls(page, 'subscriptions_v2'))[0];
  expect(sub.nextDue > before, 'subscription date did not advance');
  expect(await balance(page, 'Shopping') === 48.51, `subscription payment not logged (${await balance(page, 'Shopping')})`);
  for (const tab of ['Goals', 'Bills', 'Subscriptions', 'Net worth', 'Wishlist']) {
    await page.getByRole('tab', { name: tab }).click();
    await page.screenshot({ path: `${outDir}plan-${tab.replace(' ', '-').toLowerCase()}.png`, fullPage: true });
  }
  return page;
});

await test('currency change applies everywhere', async () => {
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'settings');
  await page.getByRole('radio', { name: '£' }).click();
  await go(page, 'home');
  expect(await page.getByText('£157.50').first().isVisible(), 'home not using new currency');
  await go(page, 'activity');
  expect(await page.getByText('−£24').first().isVisible(), 'activity not using new currency');
  return page;
});

await test('backup, erase, restore', async () => {
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Backup' }).click()]);
  const file = `${outDir}backup.json`;
  await download.saveAs(file);
  const data = JSON.parse(readFileSync(file, 'utf8'));
  expect(data.categories.length === 5 && data.transactions.length === 9, 'backup incomplete');
  await page.getByRole('button', { name: 'Erase all data' }).click();
  const d = page.getByRole('dialog', { name: 'Erase everything?' });
  await d.getByLabel('Confirmation text').fill('ERASE');
  await d.getByRole('button', { name: 'Erase all data' }).click();
  await page.getByPlaceholder('Your name (optional)').waitFor();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByRole('dialog', { name: 'Restore this backup?' }).getByRole('button', { name: 'Restore' }).click();
  await page.getByText('$157.50').first().waitFor();
  expect((await cats(page)).length === 5, 'restore failed');
  return page;
});

await test('works offline after the first visit', async () => {
  if (target && !target.startsWith('http://localhost')) {
    // Service workers need the real origin; covered by the local run.
  }
  const page = await newPage({ seed: legacyStorage() });
  await go(page, 'home');
  await page.evaluate(() => navigator.serviceWorker?.ready);
  await page.reload();
  await page.waitForTimeout(500);
  await page.context().setOffline(true);
  await page.reload();
  await page.getByText('$157.50').first().waitFor({ timeout: 5000 });
  await page.context().setOffline(false);
  return page;
});

// Cloud sync round-trip against the real Firebase project (opt-in, creates
// one anonymous user): E2E_CLOUD=1 npm run e2e
if (process.env.E2E_CLOUD) {
  await test('cloud sync uploads, then restores from Firestore', async () => {
    const page = await newPage({ seed: { ...legacyStorage(), cloud_sync: 'on' } });
    await go(page, 'home');
    await page.getByRole('img', { name: 'Synced to cloud backup' }).waitFor({ timeout: 20000 });
    await addEntry(page, { amount: '7', category: 'Grocery', note: 'Cloud check' });
    await page.waitForTimeout(2500);
    // Wipe the local copy; the cloud copy must bring it back.
    await page.evaluate(() => { localStorage.removeItem('tx_v33'); localStorage.removeItem('cats_v33'); });
    await page.reload();
    await page.getByRole('img', { name: 'Synced to cloud backup' }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800);
    const txs = JSON.parse(await ls(page, 'tx_v33') || '[]');
    expect(txs.some((t) => t.description === 'Cloud check'), 'entry did not come back from the cloud');
    expect(await balance(page, 'Grocery') === 24.5, `cloud balance wrong (${await balance(page, 'Grocery')})`);
    return page;
  });
}

for (const [label, viewport] of [['phone', { width: 390, height: 844 }], ['ipad', { width: 820, height: 1180 }], ['desktop', { width: 1280, height: 860 }]]) {
  for (const scheme of ['light', 'dark']) {
    await test(`screens render (${label}, ${scheme})`, async () => {
      const page = await newPage({ seed: legacyStorage(), viewport, colorScheme: scheme });
      for (const r of ['home', 'activity', 'insights', 'plan', 'settings']) {
        await go(page, r);
        await page.waitForTimeout(250);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow <= 0, `${r} scrolls sideways by ${overflow}px`);
        await page.screenshot({ path: `${outDir}${label}-${scheme}-${r}.png`, fullPage: true });
      }
      await go(page, 'home');
      await page.getByRole('button', { name: label === 'desktop' ? 'New entry' : 'Add transaction' }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${outDir}${label}-${scheme}-add.png` });
      return page;
    });
  }
}

await browser.close();
server?.kill();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
