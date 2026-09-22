# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Budget Tracker: an Expo (React Native + web) app in TypeScript, backed by Supabase (Postgres + Auth). Budgets per category per month, transactions, recurring rules with client-side catch-up materialization, charts, and local push notifications on budget threshold crossings. Setup (env vars, Supabase project creation, exposed-schemas step) is in `README.md` — this file assumes that's already done. Full design/scope is in `docs/superpowers/specs/2026-07-17-budget-tracking-app-design.md`; the build plan (28 tasks, all complete) is in `docs/superpowers/plans/2026-07-17-budget-tracking-app.md`; a detailed log of what actually happened building it (including every bug hit and fixed) is in `.superpowers/sdd/progress.md` — read that before assuming something works as originally planned.

## Commands

```bash
npm install
npm run web              # expo start --web — fastest way to see a change (RN Web)
npm start                # expo start — QR code for Expo Go / iOS / Android sim
npm test                 # jest, full suite
npx jest <pattern>       # run a single test file, e.g. npx jest budgetMath
npx tsc --noEmit         # type-check the whole project
npm run lint             # expo lint

npx supabase login
npx supabase link --project-ref <ref>   # must match EXPO_PUBLIC_SUPABASE_URL in .env — see gotcha below
npx supabase db push                    # apply supabase/migrations/*.sql
npx supabase migration list             # check local vs remote migration state
```

## Architecture

**Routing (Expo Router, file-based):** `app/(auth)/` is the signed-out stack (sign-in/sign-up). `app/(tabs)/` is the signed-in area — `_layout.tsx` renders `<Tabs>` with 4 visible screens (`index`=Overview, `transactions`, `reports`, `settings`) plus 7 more nested under the same group (`transaction/new`, `transaction/[id]`, `budget/[categoryId]`, `category/new`, `category/[id]`, `recurring/new`, `recurring/[id]`) that are registered with `href: null` so they're reachable via `router.push` but excluded from the tab bar buttons. This nesting is deliberate: because they're still part of the same `<Tabs>` navigator, the tab bar stays rendered underneath them instead of disappearing — keeping these screens *outside* `(tabs)` would lose the tab bar entirely. Each of those 7 has a custom `headerLeft: renderBackButton` (from `src/components/BackButton.tsx`) since `<Tabs>` has no built-in back button the way `<Stack>` does. `app/_layout.tsx` is the root — a bare `<Slot />` (no Stack/Tabs), so there's no root-level header; `AuthGate` inside it redirects between `(auth)` and `/` based on session state via `useSession`.

**The Overview FAB** (`src/components/AddTransactionFab.tsx`) is rendered from `(tabs)/_layout.tsx` itself — as a sibling *after* `<Tabs>`, shown only when `usePathname() === '/'` — not from inside `app/(tabs)/index.tsx`. It needs to visually straddle/overlap the tab bar (`position: absolute`, negative-ish `bottom` relative to the tab bar's known height, `zIndex: 100`), which only works reliably rendered at this level: nested inside the Overview screen's own content it would be clipped by (or lose the stacking-order fight with) the tab bar's own container. If you need another cross-tab floating element, follow this same pattern rather than adding it inside a screen.

**Data layer split:**
- `src/hooks/` — one file per entity, all TanStack Query. Read hooks (`useCategories`, `useBudgets(month)`, `useTransactions(month)`, `useRecurringRules`) plus mutations in the same file. `useTransactions`'s add/update mutations do optimistic updates via `onMutate`/`onError` rollback; everything else just invalidates on success.
- `src/stores/useUiStore.ts` — Zustand, holds only `selectedMonth` (client-only UI state, not server data).
- `src/domain/` — pure functions (`budgetMath.ts`, `recurring.ts`), no React/Supabase imports, unit-tested directly. `useRecurringRules`'s catch-up logic and the alert-threshold logic in `useBudgetAlerts` both delegate their actual math here rather than inlining it.
- `src/lib/supabase.ts` — the client. `db.schema: 'budget_tracker'` is set once here so no hook needs a per-call `.schema()`. Auth storage is a hand-rolled wrapper, not raw `AsyncStorage` — see gotcha below.

**Shared page layout:** every screen wraps its content in `src/styles/pageLayout.ts`'s `card` style (bordered/shadowed box, capped at 480px, centered) via its own `ScrollView`/`FlatList` — there's no shared layout *component* because the wrapping structure differs per screen (`ScrollView` for forms, `FlatList` for the transactions list). Add new screens the same way rather than introducing a competing layout pattern.

**Shared forms:** `TransactionForm`, `CategoryForm`, `RecurringRuleForm` (`src/components/`) are each used by both a `new` and an `[id]` edit screen for that entity, with `initialValues` optional. They intentionally have no outer padding/margin — the parent screen's `pageLayout.card` provides that, so don't add padding back into the form components themselves.

## Gotchas specific to this project (found by actually running it, not obvious from reading the code)

- **Supabase CLI link vs. app's actual project can silently diverge.** `supabase link --project-ref` will happily link to any project you have access to; it does not check that it matches `EXPO_PUBLIC_SUPABASE_URL` in `.env`. If they diverge, `supabase db push` succeeds while the app keeps talking to a database with no schema. Always confirm the ref in the dashboard URL matches the `.env` URL's subdomain before pushing migrations.
- **New non-`public` schemas must be added to PostgREST's exposed-schemas list** (Supabase Dashboard → Project Settings → API → Data API Settings), or every `supabase-js` call fails with `PGRST106: Invalid schema`, even though direct SQL access (`supabase db query --linked`) works fine and gives no indication anything is wrong. This project uses `budget_tracker`, not `public`.
- **Expo Router's generated typed-routes (`.expo/types/router.d.ts`) go stale** after adding/removing/moving files under `app/`, and are *not* regenerated by `tsc` alone — only while the dev server is running, and only for routes actually requested. After restructuring routes, cycle the dev server (`expo start --web`) and hit the affected routes before trusting a `tsc` route-type error as real.
- **`@react-native-async-storage/async-storage`'s web shim touches `window.localStorage`**, which doesn't exist during Expo Router's SSR (`web.output: "static"` in `app.json`). `src/lib/supabase.ts` wraps it in a storage adapter that no-ops when `typeof window === 'undefined'` — don't pass raw `AsyncStorage` to `createClient`'s `auth.storage`.
- **React Native Web deprecations on the currently-installed RN version (0.86):** use `boxShadow` (a single string), not `shadowColor`/`shadowOpacity`/`shadowRadius`/`shadowOffset`. A `DimensionValue`-typed style (e.g. a percentage width computed from a template literal) needs an explicit `` `${number}%` `` type annotation or it widens to `string` and fails to type-check.
- **`react-native-gifted-charts` requires a gradient package** (`expo-linear-gradient`, already installed) or it 500s at runtime with "Gradient package was not found" — this only shows up when actually rendering the Reports screen, not in `tsc`/`jest`.
- **No visual/screenshot verification tooling is available in this environment** (no `chromium-cli`). Verification has been: `tsc --noEmit`, `jest`, then `expo start --web` + `curl` against routes checking HTTP status, rendered HTML content, and computed CSS values (e.g. confirming `z-index`/`bottom` land as expected, or that a route's DOM order places one element after another). This catches real bugs `tsc`/`jest` miss (see the two gotchas above) but can't confirm exact pixel-level visual results — those need a human look.
- **Supabase's built-in email service is rate-limited** (2 sends/hour by default) and `mailer_autoconfirm` may be `true` on this project (check via the Management API, `GET /v1/projects/<ref>/config/auth`), meaning signups get an active session immediately regardless of whether a confirmation email arrives — the sign-up screen's "check your email" messaging may not match actual behavior.
