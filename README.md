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
   - **Cloud Vision (primary):** enable the API in Google Cloud. It needs a billing account even on the free tier. Create an API key restricted to the Vision API with no application restrictions, and add a $1 budget alert. The app caps scans at 900/month to stay inside Vision's 1,000 free images.
   - **Gemini (fallback, no billing needed):** create a key at https://aistudio.google.com/apikey. On the free tier, Google may use the submitted images to improve its products.

   With both set, Vision is tried first and Gemini takes over whenever Vision fails. Then deploy the function and wire up account-deletion cleanup:

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
