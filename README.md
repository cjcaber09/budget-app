# Budget Tracker

## CSV exports and account access

Reports offers **Export CSV** for the selected month or twelve months ending there,
with monthly spending, category breakdowns and payment-account amounts/counts.
Transactions offers a separate CSV respecting its month, Income/Expenses filter
and search, including transaction notes. Exports exclude transfers and balance
corrections from spending and disclose included future-dated entries.

Login's **Forgot password?** sends an eight-digit recovery code through hosted
Supabase's Gmail SMTP. Use a Google App Password with 2-Step Verification, host
`smtp.gmail.com`, port `587`, and matching sender/username. Enter credentials only
in Supabase SMTP settings. The reusable recovery email is
[recovery-code.html](supabase/templates/recovery-code.html); it uses `{{ .Token }}`.
Set `EXPO_PUBLIC_AUTH_OTP_LENGTH` to match hosted Auth (default `8`).

Settings' **Delete account** requires the current password and explicit permanent
deletion acknowledgment. A durable server job blocks writes/uploads, waits for
active scans, removes Storage files and deletes Auth/financial records. Cleanup
continues if the app closes; lost/expired sessions do not imply completion.
The private cleanup cron runs every five minutes. Recurring bills still prepare
from the client. See [implementation and verification](docs/superpowers/plans/2026-10-10-mvp-exports-recovery-deletion.md).

Migrations 0023/0024 and updated `ocr`/`delete-account` functions are deployed.
Run `node scripts/mvp-exports-account-sql-test.mjs --deployed` for rollback checks
and `node scripts/mvp-account-live-test.mjs` for synthetic hosted verification
without emails or OCR calls. Physical-device file sharing remains unverified.

A personal budget-tracking app built with Expo, TypeScript, and Supabase. Set a
monthly budget per category, log transactions, see spend vs. budget with
charts, get alerted when you're close to or over budget, and set up recurring
transactions (rent, subscriptions, etc.).

See `docs/superpowers/specs/2026-07-17-budget-tracking-app-design.md` for the
full design, including what's explicitly out of scope for v1.

## Prerequisites

- Node.js 18+
- A Supabase account (free tier is enough) — create a project at
  [supabase.com/dashboard](https://supabase.com/dashboard)
- Expo Go app on your phone (or an iOS/Android simulator) for local development

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the env template and fill in your Supabase project's URL and anon key
   (Project Settings → API in the Supabase dashboard):

   ```bash
   cp .env.example .env
   ```

   This app's tables live in a dedicated `budget_tracker` Postgres schema
   (not `public`), so PostgREST can serve them: in the dashboard, go to
   Project Settings → API → Data API Settings, and add `budget_tracker` to
   the "Exposed schemas" list. Without this step, every request from the app
   fails with `PGRST106: Invalid schema`.

3. Link the project and push the database schema:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   Use the project ref from the same project whose URL/anon key you put in
   `.env` — the CLI happily links to any project you have access to, and
   pushing migrations to the wrong one will silently succeed while the app
   keeps hitting a database with no tables. Double-check the ref in the
   dashboard URL (`https://supabase.com/dashboard/project/<ref>`) matches
   the subdomain in `EXPO_PUBLIC_SUPABASE_URL`.

4. Start the dev server:

   ```bash
   npm start
   ```

   Scan the QR code with Expo Go, or press `i`/`a` for the iOS/Android simulator.

5. **Receipt scanning (optional):** set up at least one OCR provider.
   - **Cloud Vision (text fallback):** enable the API in Google Cloud. It needs a billing account even on the free tier. Create an API key restricted to the Vision API with no application restrictions, and add a $1 budget alert. The app caps scans at 900/month to stay inside Vision's 1,000 free images.
   - **Gemini (primary structured extraction, no billing needed):** create a key at https://aistudio.google.com/apikey. On the free tier, Google may use the submitted images to improve its products.

   With both set, Gemini extracts merchant, receipt rows and total first; Vision provides text-only fallback if structured extraction fails. Push all migrations through 0022 before using the current profile, bill, transaction, and budget forms. Then deploy the function and wire up account-deletion cleanup:

   ```bash
   npx supabase secrets set GOOGLE_VISION_API_KEY=<key> --project-ref <ref>
   npx supabase secrets set GEMINI_API_KEY=<key> --project-ref <ref>
   npx supabase secrets set OCR_WEBHOOK_SECRET=<random-64-hex> --project-ref <ref>
   npx supabase functions deploy ocr --use-api --no-verify-jwt --project-ref <ref>
   ```

   Then in the SQL editor, store the same secret and the function URL in Vault so the `auth.users` delete trigger can reach the function:

   ```sql
   select vault.create_secret('https://<ref>.supabase.co/functions/v1/ocr', 'budget_tracker_ocr_function_url');
   select vault.create_secret('<same-random-64-hex>', 'budget_tracker_ocr_webhook_secret');
   ```

## Scripts

- `npm start` — start the Expo dev server
- `npm test` — run the Jest test suite
- `npx tsc --noEmit` — type-check the whole project
- `bash scripts/ocr-live-test.sh` — live end-to-end test of the receipt-OCR backend (one real OCR provider call; throwaway users)
- `bash scripts/ocr-cleanup-test.sh` — live test that deleting an account purges its OCR files

## Project Structure

- `app/` — screens and navigation (Expo Router: folder structure = routes)
- `src/domain/` — pure business logic (budget math, recurring-rule occurrence
  math), unit-tested independently of React and Supabase
- `src/hooks/` — TanStack Query hooks, one file per entity
- `src/components/` — shared UI components
- `src/stores/` — Zustand UI-only state
- `supabase/migrations/` — SQL migrations, applied via `supabase db push`

## Out of scope for v1

Multi-account balances, shared/household budgets, multi-currency, a
server-side cron for recurring transactions (handled via client-side
catch-up instead), and an E2E test suite. See the design spec for details.

## Receipt items

Expenses support item, discount, tax, fee and signed adjustment rows in both Add
and Edit Transaction. Rows compute the amount; without rows, enter it manually.
Included tax does not add to the total. A scanned total mismatch offers a current
signed adjustment. Income retains earning and deduction rows. Informational rows do not affect totals. Per-item reports/categories and currency
conversion are not included; the existing dollar display is preserved.

Migration `0012_transaction_items.sql` adds owner-protected rows and an atomic
SECURITY INVOKER save RPC. Deferred checks protect direct writes as well as RPC
saves. App calculations use integer cents and RPC transport uses decimal strings.
Receipt JSON is stored before the text completion marker; replay supports old
text-only scans and deletion removes both objects. No receipt image is stored.

After linking the same project as `EXPO_PUBLIC_SUPABASE_URL`, preview deployment
with `node scripts/deploy-receipt-items.mjs`. Apply the migration and deploy OCR
with `node scripts/deploy-receipt-items.mjs --apply`. The script reads the existing
environment credentials in memory and refuses a mismatched CLI project.

Run `npm test -- --runInBand`, `npx tsc --noEmit` and `npm run lint`.
SQL integrity tests use a disposable PostgreSQL container, independent of the
app's hosted Supabase database:

```sh
docker run -d --rm --name budget-receipt-sql -e POSTGRES_PASSWORD=receipt_local_test postgres:17
node scripts/receipt-sql-test.mjs --payments
docker stop budget-receipt-sql
```

The test container exposes no ports and stores no app data. Each test run creates
a fresh database. Phone-layout web captures and native Hermes exports do not
replace iOS/Android device checks for keyboard, safe areas, screen readers and
release-build motion.

For the live receipt-items checks, supply a receipt through `OCR_TEST_IMAGE` and
its printed total in integer cents through `OCR_TEST_TOTAL_CENTS`, then run
`node scripts/receipt-items-live-test.mjs` with Node.js 24+. The default fixture
is the git-ignored `assets/images/sample-receipts/receipt1.jpg` with a total of
286690 cents. This test makes one real provider scan, creates temporary users,
checks saving/replay/tenant isolation/deletion, and removes its files and users
in `finally`. It never prints credentials or receipt text. Use the existing
environment access token; this test needs admin access for throwaway-user cleanup.

## Payment receipts

Salary, transfer and payment screenshots support income/expense recognition, editable sender name and phone/account number, separate references, and a payment amount shown alongside the total. Unknown direction needs your choice; failed/pending payments offer a clean manual-entry path. Fees already reflected in a net amount remain visible as informational detail. Migration 0013 adds payment metadata, row flags, income totals and calendar dates with legacy-write protection.

Use the printed receipt transaction/issue date when clear; otherwise use the local day the scan started. The date can be edited and determines the transaction month. See [the payment receipt spec](docs/superpowers/specs/2026-10-07-payment-receipts-design.md).

`node scripts/payment-receipts-live-test.mjs` runs synthetic-only hosted payment checks without uploading an image or calling OCR. Migration 0014 preserves account-deletion cascades for itemized transactions. The app still uses hosted Supabase; the disposable Docker container is only for isolated SQL tests.

## Profile and monthly spending guidance

Signed-in screens open with System appearance, USD and the device timezone while saved preferences load. Missing profiles are created without overwriting an existing profile; saved settings replace the temporary defaults. Preference failures offer a retry in Settings and do not block navigation. Financial data retains its own loading and error states. A loaded timezone corrects the displayed current month when necessary while preserving a selected historical month. Screen changes use a 180ms fade, disabled for Reduce Motion, and Back follows navigation history.

Settings now includes display name/private avatar, password change, System/Light/Dark appearance, currency-unit selection and a financial timezone. Currency changes do not convert existing amounts. Overview shows a monthly allowance that caps combined category budgets, Safe to spend after scheduled bills, a daily allowance and spending forecast. Its top-right bell opens upcoming bills for the selected month and shows a red dot for outstanding/replacement bills. Recording, linking, skipping and replacement remain available; different payment amounts require full-settlement confirmation.

Migrations 0015-0017 add profiles, monthly limits, anchored recurring occurrences and consistent server aggregates. Legacy clients cannot write schedules or linked expenses outside the new RPCs; ordinary transaction saves remain compatible. Deploy schema plus the updated deleted-account purge before using these screens. Run `node scripts/receipt-sql-test.mjs --analytics` in the disposable test container, and `node scripts/profile-analytics-live-test.mjs` for synthetic-only hosted verification and cleanup. The latter creates temporary users and a synthetic Storage marker fixture, makes no OCR call, and changes only a temporary user password.

See [the implementation spec](docs/superpowers/specs/2026-10-07-profile-spending-guidance.md). Native device photo permissions, keyboard, pickers and screen-reader behavior still require device verification.

## Phone notifications

In the iOS/Android app, open Settings -> Phone notifications to enable Budget alerts or Bill reminders and grant phone permission. Budget alerts check category and monthly 80%/100% thresholds when current-month spending syncs; existing spending is silent on first enable. Hide details on lock screen is on by default. Settings also offers a test notification, phone-settings recovery and reminder refresh. These controls are disabled in the web preview.

Each recurring bill can opt into a due-day, 1-day-before or 3-days-before reminder at HH:MM in your financial timezone. Up to 48 nearest future reminders are scheduled for the next 30 days. Open the phone app to refresh after changes on another device; local schedules cannot react before that sync. Turning reminders off or signing out cancels scheduled bill reminders. Your phone may delay delivery. Recurring expenses still record automatically when you open the app.

Scan history loads 20 records initially and offers Load more with retry. Other lists retain their existing presentation. See [the implementation spec](docs/superpowers/specs/2026-10-08-phone-notifications.md) for behavior and verification limits. Push migration 0018 before using notification settings. Guarded deployment uses `node scripts/deploy-phone-notifications.mjs`; rollback-only hosted checks use `node scripts/phone-notifications-sql-test.mjs --deployed`.

## Payment methods and tracked balances

Create independent cards, bank accounts, e-wallets and other methods from Settings or transaction review, including several from the same bank. Save the required initial balance first, then save the transaction separately; a failed transaction save leaves the created method available. Cash is the default and shows Balance not set until initialized. Card last-four is optional: exactly four digits or blank. Never enter a full card number, PIN or CVV.

Tracked balances use a server baseline and subsequent assignments: old Cash history is not deducted again, newly recorded backdated transactions count once, and future records apply on their financial date. Credit cards show Amount owed or an overpayment Credit balance. These are manually tracked amounts without bank connectivity. Auditable corrections and transfers, including card repayment, do not add budget income/expenses. Editing the initial amount after activity requires confirmation.

Bills inherit future method assignments while recorded history is preserved. Archive reassigns active/paused bill references and pending occurrences atomically; Cash cannot be archived. Restore is available.

Migration 0019 is deployed to the configured Supabase project (remote 0001-0019 confirmed). See [implementation and verification](docs/superpowers/specs/2026-10-08-payment-methods.md). Run hosted rollback-only checks with `node scripts/payment-methods-sql-test.mjs --deployed`; run exact-retry concurrency checks with `node scripts/payment-methods-concurrency-test.mjs` (synthetic owner removed). No Docker or OCR provider call is needed. Phone web interactions and iOS/Android Hermes/web exports passed; physical-device keyboard, safe areas, native picker presentation and accessibility remain unverified.

Script transport and safe-logging regression checks: `node --test scripts/lib/supabase-project.test.mjs`.

## Monthly allowance and category budgets

Combined category budgets may equal, but cannot exceed, the monthly allowance. Set an allowance before adding or increasing positive budgets; reducing the allowance below combined allocations is rejected. Saving against a future inherited allowance freezes that month's allowance. Existing excessive or allowance-less allocations can be repaired through strict budget reductions without silently rewriting saved amounts. Automatic inheritance skips an invalid lower allowance so legacy data cannot block Overview.

Tapping a category budget opens its read-only value and all category transactions for the selected month; Edit opens a fresh draft with available capacity and retry recovery. Shared date fields retain native pickers and use the browser calendar on web, including correctly labeled Next due date fields. Email remains noneditable without the redundant helper sentence.

Migration 0020 is deployed to the configured Supabase project (remote 0001-0020 confirmed). Budget and allowance saves use owner-locked RPCs; authenticated table access is read-only. See [the implemented spec](docs/superpowers/specs/2026-10-08-combined-budget-cap.md). Hosted rollback checks: `node scripts/combined-budget-cap-sql-test.mjs --deployed`; concurrent cap checks: `node scripts/combined-budget-concurrency-test.mjs` (synthetic owner removed). No Docker or OCR provider call is needed.

Verification passed 250 Jest tests across 40 suites, TypeScript, lint, synthetic 390px light/dark phone interactions, and production iOS/Android Hermes and web 28-route exports. Physical-device picker presentation, keyboard, safe areas and accessibility remain unverified.

## Overview and Reports

Overview keeps monthly allowance, Safe to Spend/per-day allowance, Income/Expenses/Net Income, tappable over-budget alerts above a centered month selector, and the upcoming bills bell. Reports holds Budget vs Actual in a three-column category doughnut grid, the categorized-expense doughnut with its list legend, current-month Daily Spending Pace with forecast/allowance comparison, and a responsive twelve-month line/area trend. The trend ends in the selected month and includes recorded future-dated entries; readable monthly amounts identify the current month as in progress. Section-local errors offer retry without fabricated totals.

Implementation and verification: [dashboard report move](docs/superpowers/plans/2026-10-09-dashboard-reports-move.md). The additional analytics are implemented in the [Reports expansion plan](docs/superpowers/plans/2026-10-09-reports-expansion.md).

## Optional demo report data

For an existing test account, preview with `node scripts/seed-demo-reports.mjs --email=<account-email>`, then add `--apply` to write. The configured-project guard and owner-checked RPCs preserve existing transactions, budgets and allowances. Demo notes identify up to 60 examples across six months; deterministic IDs prevent duplicate reruns. No account, credentials, payment balance or bill configuration is replaced.

## Expanded Reports and income sources

Reports now opens detailed cash flow, income breakdown/history, individual account expenses, previous-month comparison and daily/weekly/monthly trends. Category detail adds remaining/overage, spending share, transaction count and history while retaining Edit budget. All categories, including zero spending and Uncategorized, use total expenses for their percentages. Internal transfers have a separate read-only history and never affect income, expenses or net amounts.

Optional income sources can be created in Settings or income review, renamed, archived and restored. Existing income stays Unspecified; OCR sender details do not infer a source. Failed creation retains the same UUID and name for retry, and a created source survives a failed transaction save.

Migrations 0021–0022 are deployed; configured remote 0001–0022 confirmed. Run `node scripts/reports-expansion-sql-test.mjs --deployed` for rollback checks and `node scripts/reports-expansion-concurrency-test.mjs` for synthetic retry/archive checks with cleanup. `node scripts/deploy-reports-expansion.mjs` previews migrations; `--apply` deploys them after checking the app/CLI project match. No Docker or OCR call is required. See [implemented plan and verification](docs/superpowers/plans/2026-10-09-reports-expansion.md).
