# Budget Tracking App — Design

## Purpose

A React Native (Expo) app for personal budget tracking: set a monthly budget per
category, log transactions against those categories, and see spend vs. budget at
a glance. Includes spending charts/reports, budget alerts, and recurring
transactions. Single-user personal data with cloud sync via Supabase (no
household/shared budgets, no multi-account balances in v1).

## Stack

- **Client:** Expo (managed workflow), TypeScript, Expo Router for navigation
- **Backend:** Supabase (Postgres + Auth), Row Level Security scoped to `auth.uid()`
- **Server state:** TanStack Query — one hook per entity (`useCategories`,
  `useBudgets(month)`, `useTransactions(month)`, `useRecurringRules`), caching,
  retries with backoff, optimistic mutations
- **UI-only state:** Zustand — selected month, in-progress form drafts
- **Charts:** `react-native-gifted-charts` (donut for spend-by-category, bar for
  monthly trend) — no native Skia setup required, keeps Expo managed workflow simple
- **Notifications:** `expo-notifications` for local (on-device) notifications
  only — no push server, since alerts are triggered by the user's own in-app
  actions

Rejected alternatives: Redux Toolkit + RTK Query (more ceremony than this app's
size warrants); plain Context + manual fetch calls (would hand-roll the
caching/retry behavior TanStack Query provides for free). Firebase was
considered for the backend but Supabase's Postgres + SQL was preferred for
budget aggregation queries. Bare React Native CLI was considered but Expo's
managed workflow removes native project setup for a v1 with no custom native
module needs.

## Data Model

All tables have `user_id` with an RLS policy restricting select/insert/update/delete
to rows where `user_id = auth.uid()`.

- **`categories`** — `id`, `user_id`, `name`, `color`, `icon`, `is_default`
  (bool; seeded for every new user at signup: Groceries, Rent, Transport,
  Utilities, Entertainment, Health, Other)
- **`budgets`** — `id`, `user_id`, `category_id`, `month` (date, stored as
  first-of-month), `amount`
- **`transactions`** — `id`, `user_id`, `category_id`, `amount`, `note`,
  `occurred_at` (timestamp), `recurring_rule_id` (nullable FK)
- **`recurring_rules`** — `id`, `user_id`, `category_id`, `amount`, `note`,
  `frequency` (enum: `weekly` | `monthly`), `next_occurrence_date`, `active` (bool)

### Recurring transactions: client-side catch-up

Rather than a server-side cron (Supabase Edge Function + `pg_cron`), recurring
transactions are materialized by the client: on app launch/foreground, the app
queries `recurring_rules` for any rule whose `next_occurrence_date` is due,
inserts a corresponding `transactions` row backdated to that due date, and
advances `next_occurrence_date`. This avoids standing up and maintaining
server-side scheduled jobs for v1. Trade-off: a transaction from a recurring
rule won't appear until the user next opens the app (correctly dated when it
does). A true background cron is a natural v2 upgrade if transactions need to
appear without the user opening the app.

## Screens & Navigation

Four bottom tabs via Expo Router:

1. **Overview** — current month: total budgeted vs. spent, a progress bar per
   category (green/yellow/red as spend nears/exceeds budget), active alert
   banners. Tapping a category opens its budget editor for the month. A
   floating "+" opens the add-transaction modal.
2. **Transactions** — chronological list grouped by day, filterable by
   category and month. Tap an entry to edit/delete.
3. **Reports** — this month's spend-by-category donut chart, and a bar chart
   of total spend over the last 6 months, with a month picker for history.
4. **Settings** — manage categories (add/rename/recolor), manage recurring
   rules (create/edit/pause), notification preferences, sign out.

**Auth flow:** a lightweight stack (Sign In / Sign Up) shown when there is no
active Supabase session, driven by `supabase.auth.onAuthStateChange`; swaps to
the tab navigator once authenticated. First sign-up seeds the default category
set. No onboarding wizard beyond that.

## Data Flow

Each screen's TanStack Query hooks fetch from Supabase and cache by query key.
Adding/editing a transaction is a mutation with an optimistic update; on
success it invalidates that month's `transactions` and budget-aggregate
queries. Budget-vs-spend numbers and chart data are derived client-side from
cached transactions via memoized selectors — no separate aggregation table at
this scale. The recurring-rule catch-up runs once per app foreground, writes
any due transactions, then invalidates the same queries so Overview and
Reports update automatically.

**Alerts:** computed from the same cached data. When a mutation pushes a
category's spend past 80% or 100% of its budget, the app fires a local
notification (`expo-notifications`) plus an in-app banner on Overview.

## Error Handling

- Network/Supabase failures surface as a dismissible toast, never fail
  silently. TanStack Query retries transient failures with backoff.
- Auth errors (bad credentials, expired session) route back to Sign In with a
  clear message.
- Recurring catch-up failures are logged and retried on the next foreground
  rather than blocking app use.
- Forms validate inline (amount > 0, category required) before submit.

## Testing

- **Unit (Jest):** budget aggregation math (spend vs. budget per category),
  recurring-rule next-occurrence calculation, and the 80%/100%
  threshold-crossing logic that triggers alerts — pure functions where subtle
  bugs are most likely and easiest to isolate.
- **Component (React Native Testing Library):** Overview renders correct
  progress-bar state given mock budget/transaction data; Add Transaction form
  blocks submit on invalid input.
- **Out of scope for v1:** E2E (Detox) — significant setup overhead better
  justified once core flows stabilize.

## Explicitly Out of Scope (v1)

- Multi-account / multiple balances (checking, cash, credit card tracked
  separately)
- Shared/household budgets or multi-user collaboration
- Server-side cron for recurring transactions (client catch-up instead)
- Multi-currency support
- E2E test suite
