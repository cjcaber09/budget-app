# Budget Tracker

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

   With both set, Gemini extracts merchant, receipt rows and total first; Vision provides text-only fallback if structured extraction fails. Push all migrations through 0017 before using the current profile, bill, and transaction forms. Then deploy the function and wire up account-deletion cleanup:

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

Settings now includes display name/private avatar, password change, System/Light/Dark appearance, currency-unit selection and a financial timezone. Currency changes do not convert existing amounts. Overview adds an independent monthly limit, Safe to spend after scheduled bills, a daily allowance and spending forecast. Upcoming bills support recording, linking, skipping and replacement; different payment amounts require full-settlement confirmation.

Migrations 0015-0017 add profiles, monthly limits, anchored recurring occurrences and consistent server aggregates. Legacy clients cannot write schedules or linked expenses outside the new RPCs; ordinary transaction saves remain compatible. Deploy schema plus the updated deleted-account purge before using these screens. Run `node scripts/receipt-sql-test.mjs --analytics` in the disposable test container, and `node scripts/profile-analytics-live-test.mjs` for synthetic-only hosted verification and cleanup. The latter creates temporary users and a synthetic Storage marker fixture, makes no OCR call, and changes only a temporary user password.

See [the implementation spec](docs/superpowers/specs/2026-10-07-profile-spending-guidance.md). Native device photo permissions, keyboard, pickers and screen-reader behavior still require device verification.
