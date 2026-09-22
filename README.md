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

## Scripts

- `npm start` — start the Expo dev server
- `npm test` — run the Jest test suite
- `npx tsc --noEmit` — type-check the whole project

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
