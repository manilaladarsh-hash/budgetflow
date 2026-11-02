# BudgetFlow

A calm, phone-first budget tracker. Split your money into weekly or monthly budgets, log what you spend, and let the app refill your budgets every Sunday. Unspent money partly rolls over. It works on phones, iPads and desktops, follows your light/dark setting, and keeps working offline.

**[Open BudgetFlow](https://manilaladarsh-hash.github.io/budgetflow/)**. On a phone, use *Add to Home Screen* to get an app-like icon.

## How to use

- **Home:** shows how much is left across your budgets, what's safe to spend, this week's pace, bills that are coming up, and recent entries. Tap **−** on a budget to log an expense to it quickly. Tap the budget itself to see its history, edit it or pin it.
- **＋ (Add):** log an expense or income, move money between budgets, or split one purchase across several. You can pick a past date and mark an entry to repeat every cycle.
- **Activity:** search and filter every entry (by type, budget, tags or date range). Tap an entry to edit, duplicate or delete it; deleting can be undone.
- **Insights:** a monthly breakdown, a daily spending chart, a comparison with last month, a spending calendar, highlights, and your cycle history.
- **Plan:** savings goals (deposits, withdrawals, optional target dates), monthly bills, subscriptions, net worth and a wishlist. Marking a bill or subscription paid can also log it as an expense.
- **Settings** (gear icon): name, currency, theme, budgets (add, edit, reorder), daily limit and large-expense alert, tags, the optional AI key, cloud backup, and data tools.

### Import from your banks and cards

**Activity → Import** (the upload icon) reads transaction files from any bank or card: CSV, OFX, QFX or QBO. Download them from each bank's website and import them all at once.
- **Detection:** works out the columns, the date format and whether purchases are shown as plus or minus.
- **Auto-sort:** sorts each entry into a budget using your rules, your past entries and a built-in list of common merchants. Pick a budget for a new merchant once and it's remembered; you can manage these under **Settings → Auto-sort rules**.
- **Skips:** card payments, transfers between your own accounts, rows already imported, and purchases you already logged by hand or with Apple Pay.
- **Card labels:** each entry is tagged with the card or account it came from. Activity can filter by card.
- **Older entries:** entries from before the current budget period go into history (Insights) without changing this week's balances.
- **Undo:** the whole import can be undone in one tap.

Files are read in the browser and never uploaded.

### Apple Pay auto-log (iPhone)

**Settings → Apple Pay auto-log** walks you through a one-time Shortcuts automation. It opens a link like this after every Apple Pay purchase:

```
https://manilaladarsh-hash.github.io/budgetflow/#/add?auto=1&amount=6.45&merchant=Starbucks&card=Amex
```

Known merchants are logged instantly to the right budget. New ones open a pre-filled entry so you can pick the budget, and BudgetFlow remembers it. A double-fired link is ignored. Shortcuts opens links in Safari, so use BudgetFlow in Safari rather than as a Home Screen app for this, because iOS keeps their data separate.

### How cycles work

Every Sunday at midnight, weekly budgets refill. Up to 50% of a budget's unspent money carries over; overspending carries over in full. Monthly budgets refill on the first cycle of a new month. Repeating entries are added once per cycle. If the app wasn't opened for a while, missed cycles are caught up when it next opens. Tap the countdown in the header to preview the next renewal.

## Your data

- Everything is saved in your browser. Turn on **Settings → Cloud backup** to also mirror budgets and entries to Firebase under an anonymous account. That account is tied to this browser and is **not** a way to sign in on another device.
- **Settings → Backup** downloads a JSON file and **Restore** loads one. Backups from older versions of BudgetFlow restore too. **Export CSV** is for spreadsheets.
- Version 4 reads the same browser storage as earlier versions, so existing data carries over automatically. Before its first save it also keeps a one-time safety copy of the old data in `bf_pre_v4_snapshot`; this copy never includes your AI key.

## Optional AI (Gemini)

Add your own Gemini API key in **Settings** to get these features:
- turn a sentence or your voice into an entry;
- scan a receipt;
- chat about your spending;
- generate a monthly report card;
- get suggested budget amounts.

The key stays in your browser and is sent only to Google, in a request header. Using these features sends the relevant text, image or budget summary to Gemini. Budgeting works fully without a key.

## Development

The source lives in `app/` (React 19, Vite, Tailwind CSS 4, lucide-react). GitHub Pages serves the **built** files committed at the repository root (`index.html`, `assets/`, `sw.js`, `manifest.webmanifest` and icons), so you need to rebuild after changing the source.

```sh
npm install
npm run dev        # local dev server with hot reload
npm test           # unit tests (Vitest)
npm run build      # builds to dist/ and copies the result to the repo root
npm run e2e        # browser tests against the build (Playwright)
```

Commit the source changes **and** the rebuilt root files together. CI (`.github/workflows/ci.yml`) runs the tests and fails if the committed build doesn't match the source.

To check cloud sync end to end, run `E2E_CLOUD=1 npm run e2e`. This creates one anonymous Firebase user. `npm run e2e -- <url>` runs the browser tests against a deployed copy.

Project layout:

```
app/src/lib/       pure logic: cycles, transactions, analytics, storage, backup, statement import,
                   merchant rules, quick-add links, Gemini, cloud sync
app/src/state/     app store (persistence, sync, cycle renewal) and navigation context
app/src/ui/        design-system components, icons, toasts/confirm dialogs
app/src/features/  screens and sheets
tests/unit/        Vitest tests for app/src/lib
tests/fixtures/    sample bank/card exports (made-up data) used by the tests
tests/e2e/         Playwright flows and a legacy-data fixture
```

For your own hosted copy, replace `firebaseConfig` in `app/src/lib/sync.js` with your project's configuration. Then enable Anonymous Authentication and restrict Firestore access to each user's own `artifacts/{appId}/users/{uid}` documents.
