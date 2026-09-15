# BudgetFlow

A personal budget tracker for organizing spending into envelopes, logging income and expenses, and seeing where your money goes. Built for desktop and mobile browsers.

**[Open BudgetFlow](https://manilaladarsh-hash.github.io/budgetflow/)**

## How to use

1. **Set your budget:** on **Home**, customize the starter envelopes (Grocery, Shopping, Rent, and Phone) or add your own. Set each envelope's budget and available balance.
2. **Record a transaction:** select **Add**, choose income or expense, enter an amount and category, then save. Add a description, date, or tags for easier tracking.
3. **Check your progress:** use **Home** for available balances and **Stats** for spending charts and monthly comparisons.
4. **Review your history:** open **Log** to search, filter, edit, or delete transactions.
5. **Explore extras:** track savings goals, subscriptions, bills, assets and liabilities, and wishlist items. Weekly budget cycles renew automatically while the app is running or when it is reopened.

## Back up your data

Open **Tools** to access:

- **Backup Data:** download a JSON backup of your budget and tracking data.
- **Restore Data:** select a previously downloaded JSON backup and confirm the restore.
- **Export CSV:** download transactions for a spreadsheet.
- **Print / PDF:** print a report or save it as a PDF through your browser.

Keep regular JSON backups, especially before clearing browser data or changing devices. CSV exports are for analysis; use JSON for restoring data.

## Run locally

The app lives in a single `index.html`; there is no build step or package installation.

```sh
git clone https://github.com/manilaladarsh-hash/budgetflow.git
cd budgetflow
python -m http.server 8000
```

With Python 3 installed, open **http://localhost:8000**. On Windows, use `py -m http.server 8000` if `python` is unavailable. Stop the server with **Ctrl+C**.

An internet connection is needed to load the externally hosted libraries and use cloud or AI features.

## Storage and optional AI

- The app uses browser storage and attempts anonymous Firebase sign-in for cloud storage of categories, transactions, and the week count. Other tracking features use browser storage. Anonymous sign-in is not a portable account for signing in on another device; use backups to move data.
- For your own hosted copy, replace `firebaseConfig` in `index.html` with your Firebase project's configuration and configure Anonymous Authentication and Firestore access rules for each user's data. If Firebase is unavailable, the app falls back to browser storage.
- Optional Gemini features include text entry, receipt scanning, and budget insights. Enter your own **Gemini API Key** in **Tools** and choose a model available to your account. Manual budgeting does not require an AI key.
- The AI key is stored in your browser. Using AI sends the relevant input, receipt image, or budget context to Google's Gemini service. Model availability and API usage limits depend on your account.

## Built with

HTML, React 18, Tailwind CSS, Lucide icons, Firebase, and the Gemini API. Libraries load from CDNs; React JSX is compiled in the browser with Babel.
