# Budget Tracking App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a v1 Expo/TypeScript budget-tracking app with Supabase-backed auth and data sync: per-category monthly budgets, transaction logging, spend-vs-budget alerts, recurring transactions, and spending charts.

**Architecture:** Expo Router drives navigation (auth stack vs. 4-tab main app). TanStack Query owns all Supabase-backed server state through one hook per entity, with query/mutation errors routed through a global handler to a dismissible toast; Zustand holds only small UI state (selected month, the toast message). Budget/alert/recurring-occurrence math lives in pure, unit-tested functions in `src/domain/`, decoupled from React and Supabase so they can be tested without mocking the network.

**Tech Stack:** Expo (managed, TypeScript), Expo Router, `@supabase/supabase-js`, `@tanstack/react-query`, `zustand`, `react-native-gifted-charts`, `expo-notifications`, `date-fns`, Jest (`jest-expo` preset) + `@testing-library/react-native`.

## Global Constraints

- Client: Expo managed workflow, TypeScript, Expo Router (from spec §Stack).
- Backend: Supabase (Postgres + Auth), Row Level Security scoped to `auth.uid()` on every table (from spec §Data Model).
- Server state: TanStack Query, one hook per entity (from spec §Stack).
- UI-only state: Zustand, limited to selected month and form drafts (from spec §Stack).
- Error handling: network/Supabase failures surface as a dismissible toast, never fail silently (from spec §Error Handling).
- Charts: `react-native-gifted-charts` only — no Skia/Victory (from spec §Stack).
- Notifications: `expo-notifications` local notifications only, no push server (from spec §Stack).
- Recurring transactions: client-side catch-up on launch/foreground, no server cron (from spec §Recurring transactions).
- Out of scope for v1 — do not build: multi-account balances, shared/household budgets, multi-currency, server-side cron, E2E (Detox) suite (from spec §Explicitly Out of Scope).

## File Structure

```
app/
  _layout.tsx                  # Root: QueryClientProvider + auth-gated redirect
  (auth)/_layout.tsx           # Stack layout for sign-in/sign-up
  (auth)/sign-in.tsx
  (auth)/sign-up.tsx
  (tabs)/_layout.tsx           # 4-tab layout
  (tabs)/index.tsx             # Overview
  (tabs)/transactions.tsx
  (tabs)/reports.tsx
  (tabs)/settings.tsx
  transaction/new.tsx          # Add transaction (modal)
  transaction/[id].tsx         # Edit transaction (modal)
  budget/[categoryId].tsx      # Edit a category's monthly budget (modal)
  category/new.tsx             # Add category (modal)
  category/[id].tsx            # Edit (rename/recolor) category (modal)
  recurring/new.tsx            # Add recurring rule (modal)
  recurring/[id].tsx           # Edit/pause recurring rule (modal)

src/
  lib/supabase.ts              # Supabase client singleton
  stores/useUiStore.ts         # Zustand: selectedMonth
  stores/useToastStore.ts      # Zustand: global dismissible error toast
  domain/budgetMath.ts         # Pure: spend aggregation, threshold crossing
  domain/recurring.ts          # Pure: next-occurrence, due-occurrence calc
  types/database.ts            # Category, Budget, Transaction, RecurringRule types
  hooks/useSession.ts
  hooks/useCategories.ts       # query + useAddCategory/useUpdateCategory
  hooks/useBudgets.ts          # query + useSetBudget
  hooks/useTransactions.ts     # query + add/update/delete mutations
  hooks/useRecurringRules.ts   # query + catch-up + add/update/setActive mutations
  hooks/useMonthlyTotals.ts    # aggregated spend per month, for Reports
  hooks/useBudgetAlerts.ts     # reactive threshold-crossing -> local notification
  components/Toast.tsx
  components/CategoryProgressBar.tsx
  components/AlertBanner.tsx
  components/TransactionListItem.tsx
  components/TransactionForm.tsx
  components/CategoryForm.tsx
  components/RecurringRuleForm.tsx
  components/SpendByCategoryChart.tsx
  components/MonthlyTrendChart.tsx

supabase/migrations/
  0001_categories.sql
  0002_budgets.sql
  0003_transactions.sql
  0004_recurring_rules.sql
  0005_seed_default_categories.sql

__tests__/
  domain/budgetMath.test.ts
  domain/recurring.test.ts
  components/Overview.test.tsx
  components/AddTransactionForm.test.tsx

.env.example                  # Supabase URL/anon key template
jest.config.js
README.md
```

---

### Task 1: Initialize the Expo project

> **Amended after implementation:** originally scaffolded at SDK 52. The
> user's Expo Go app requires SDK 57, so the project was moved to SDK 57
> (commit `bbee722`). SDK 57's default template also restructures routes
> under `src/app/` with a custom tab component instead of the classic
> `app/` + `expo-router` `Tabs` convention this plan is written against —
> `expo-router` still fully supports the classic layout at SDK 57, so the
> classic top-level `app/` layout was restored on top of the SDK 57
> dependencies (commit `65fa299`). Every task below that references
> `app/...` paths and `Tabs`/`Tabs.Screen` remains valid as written; only
> the underlying SDK/dependency versions changed.

**Files:**
- Create: entire project scaffold via `create-expo-app` (package.json, app.json, tsconfig.json, app/ dir with default routes)

**Interfaces:**
- Produces: a runnable Expo TypeScript project with Expo Router installed, at the repo root.

- [ ] **Step 1: Scaffold the project**

Run from the repo root (`C:\Users\Lenovo\ai-projects\Budget-management`):

```bash
npx create-expo-app@latest . --template default@sdk-52
```

(Superseded — see amendment note above. Use whatever SDK version matches your actual Expo Go / target device, and expect to reconcile the resulting template layout against this plan's classic `app/` structure if the default template has since changed shape.)

When prompted about the non-empty directory (it contains `docs/` and `.git/`), confirm to proceed.

- [ ] **Step 2: Verify TypeScript template and Expo Router are present**

```bash
cat package.json | grep -E "expo-router|typescript"
ls app
```

Expected: `package.json` lists `expo-router` and `typescript` as dependencies; `app/` contains `_layout.tsx` and `index.tsx` (or similar default routes).

- [ ] **Step 3: Start the dev server once to confirm the default template runs**

```bash
npx expo start --non-interactive &
sleep 15
curl -s http://localhost:8081/status
kill %1
```

Expected: the `curl` call returns `packager-status:running` (Metro bundler is up). Stop the server after confirming.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo Router TypeScript project"
```

---

### Task 2: Install and configure dependencies

**Files:**
- Modify: `package.json`
- Create: `jest.config.js`, `.env.example`

**Interfaces:**
- Produces: all runtime and dev dependencies listed in Tech Stack installed; Jest configured to run with `jest-expo`.

- [ ] **Step 1: Install runtime dependencies**

```bash
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage @tanstack/react-query zustand react-native-gifted-charts react-native-svg expo-notifications date-fns react-native-url-polyfill
```

- [ ] **Step 2: Install dev/test dependencies**

```bash
npx expo install --dev jest-expo @testing-library/react-native @types/jest
```

- [ ] **Step 3: Add Jest config**

Create `jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)',
  ],
};
```

- [ ] **Step 4: Add a `test` script to package.json**

Edit the `"scripts"` block in `package.json` to include:

```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "web": "expo start --web",
  "test": "jest"
}
```

- [ ] **Step 5: Add `.env.example` documenting required env vars**

Create `.env.example`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

- [ ] **Step 6: Verify Jest runs (even with no tests yet)**

```bash
npx jest --passWithNoTests
```

Expected: `No tests found` message but exit code 0 (via `--passWithNoTests`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Supabase, TanStack Query, Zustand, charts, notifications deps and Jest config"
```

---

### Task 3: Supabase client and typed database models

**Files:**
- Create: `src/lib/supabase.ts`
- Create: `src/types/database.ts`
- Test: none (thin config wrapper; exercised indirectly by hook tests in later tasks)

**Interfaces:**
- Produces: `supabase` (typed `SupabaseClient`) exported from `src/lib/supabase.ts`; `Category`, `Budget`, `Transaction`, `RecurringRule`, `RecurringFrequency` types exported from `src/types/database.ts`.

- [ ] **Step 1: Write the database row types**

Create `src/types/database.ts`:

```typescript
export type RecurringFrequency = 'weekly' | 'monthly';

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  is_default: boolean;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  month: string; // ISO date string, first-of-month
  amount: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  note: string | null;
  occurred_at: string; // ISO timestamp
  recurring_rule_id: string | null;
}

export interface RecurringRule {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
  next_occurrence_date: string; // ISO date string
  active: boolean;
}
```

- [ ] **Step 2: Write the Supabase client**

Create `src/lib/supabase.ts`:

```typescript
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill in your Supabase project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

- [ ] **Step 3: Create a local `.env` from the example so the app can start**

```bash
cp .env.example .env
```

(Leave placeholder values for now — Task 5 covers creating the real Supabase project and filling these in.)

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors referencing `src/lib/supabase.ts` or `src/types/database.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add Supabase client and database row types"
```

---

### Task 4: Root layout with QueryClientProvider, auth gating, and global error toast

**Files:**
- Create: `app/_layout.tsx`
- Create: `src/hooks/useSession.ts`
- Create: `src/stores/useToastStore.ts`
- Create: `src/components/Toast.tsx`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts` (Task 3).
- Produces: `useSession(): { session: Session | null; loading: boolean }` (used by Task 13/14 auth screens and this layout); `useToastStore(): { message: string | null; showToast: (message: string) => void; dismissToast: () => void }`, consumed by `Toast` (rendered once here) — every TanStack Query hook added in later tasks (Task 16 onward) automatically surfaces its errors through this toast with no per-hook wiring needed, since the `QueryClient` created here routes all query/mutation errors through it. Root layout renders `<Slot />` and redirects between `(auth)` and `(tabs)` route groups based on session state.

- [ ] **Step 1: Write `useSession`**

Create `src/hooks/useSession.ts`:

```typescript
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
```

- [ ] **Step 2: Write the toast store and component**

Create `src/stores/useToastStore.ts`:

```typescript
import { create } from 'zustand';

interface ToastState {
  message: string | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message) => set({ message }),
  dismissToast: () => set({ message: null }),
}));
```

Create `src/components/Toast.tsx`:

```typescript
import { Pressable, Text, StyleSheet } from 'react-native';
import { useToastStore } from '../stores/useToastStore';

export function Toast() {
  const message = useToastStore((state) => state.message);
  const dismissToast = useToastStore((state) => state.dismissToast);

  if (!message) return null;

  return (
    <Pressable style={styles.toast} onPress={dismissToast}>
      <Text style={styles.text}>{message}</Text>
      <Text style={styles.dismiss}>Dismiss</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: '#323232',
    borderRadius: 8,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  text: { color: '#fff', flexShrink: 1, marginRight: 12 },
  dismiss: { color: '#90CAF9', fontWeight: '600' },
});
```

- [ ] **Step 3: Write the root layout**

Create `app/_layout.tsx`:

```typescript
import { useEffect } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useSession } from '../src/hooks/useSession';
import { useToastStore } from '../src/stores/useToastStore';
import { Toast } from '../src/components/Toast';

function handleQueryError(error: unknown) {
  console.error(error);
  const message = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
  useToastStore.getState().showToast(message);
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleQueryError }),
  mutationCache: new MutationCache({ onError: handleQueryError }),
});

function AuthGate() {
  const { session, loading } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/sign-in');
    } else if (session && inAuthGroup) {
      router.replace('/');
    }
  }, [session, loading, segments, router]);

  return <Slot />;
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
      <Toast />
    </QueryClientProvider>
  );
}
```

TanStack Query retries failed queries with backoff by default (no extra config needed), and every query/mutation error — from any hook added in later tasks — now surfaces as a dismissible toast instead of failing silently, satisfying the spec's error-handling requirement app-wide.

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors. (The app won't run end-to-end until Task 13/14 add the `(auth)` and `(tabs)` route groups it redirects to — that's expected at this point.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add root layout with QueryClientProvider, auth redirect, and global error toast"
```

---

### Task 5: Supabase CLI setup + `categories` migration

**Files:**
- Create: `supabase/migrations/0001_categories.sql`
- Create: `supabase/config.toml` (generated by `supabase init`)

**Interfaces:**
- Produces: a linked Supabase project with a `public.categories` table (RLS enabled, 4 policies) that Task 9's seed trigger and Task 15's `useCategories` hook depend on.

**Manual prerequisite (do this in the Supabase dashboard, not the terminal):** create a project at supabase.com/dashboard if you don't have one yet. From Project Settings → API, copy the Project URL and `anon` public key into your local `.env` (replacing the placeholders from Task 3), and note the Project Reference ID (Settings → General).

- [ ] **Step 1: Install the Supabase CLI as a dev dependency**

```bash
npm install --save-dev supabase
```

- [ ] **Step 2: Initialize and link the project**

```bash
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

`supabase login` opens a browser for authentication. Replace `YOUR_PROJECT_REF` with the Project Reference ID from the dashboard.

- [ ] **Step 3: Write the categories migration**

Create `supabase/migrations/0001_categories.sql`:

```sql
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  icon text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "categories_select_own" on public.categories
  for select using (auth.uid() = user_id);

create policy "categories_insert_own" on public.categories
  for insert with check (auth.uid() = user_id);

create policy "categories_update_own" on public.categories
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "categories_delete_own" on public.categories
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 4: Push the migration**

```bash
npx supabase db push
```

Expected: CLI output confirms `0001_categories.sql` applied with no errors.

- [ ] **Step 5: Verify in the dashboard**

Open Table Editor → `categories` in the Supabase dashboard. Confirm the table exists, the RLS toggle reads "Enabled", and Authentication → Policies lists 4 policies for `categories` (select/insert/update/delete, each scoped to own rows).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Supabase CLI config and categories table migration"
```

---

### Task 6: `budgets` migration

**Files:**
- Create: `supabase/migrations/0002_budgets.sql`

**Interfaces:**
- Consumes: `public.categories(id)` (Task 5).
- Produces: `public.budgets` table that Task 16's `useBudgets` hook depends on.

- [ ] **Step 1: Write the budgets migration**

Create `supabase/migrations/0002_budgets.sql`:

```sql
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  month date not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

alter table public.budgets enable row level security;

create policy "budgets_select_own" on public.budgets
  for select using (auth.uid() = user_id);

create policy "budgets_insert_own" on public.budgets
  for insert with check (auth.uid() = user_id);

create policy "budgets_update_own" on public.budgets
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budgets_delete_own" on public.budgets
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Push and verify**

```bash
npx supabase db push
```

Expected: CLI confirms `0002_budgets.sql` applied. Then confirm in the dashboard (Table Editor → `budgets`) that the table exists with RLS enabled and 4 policies, same as Task 5 Step 5.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add budgets table migration"
```

---

### Task 7: `transactions` migration

**Files:**
- Create: `supabase/migrations/0003_transactions.sql`

**Interfaces:**
- Consumes: `public.categories(id)` (Task 5).
- Produces: `public.transactions` table (with a not-yet-constrained `recurring_rule_id` column, wired to `recurring_rules` in Task 8) that Task 17's `useTransactions` hook depends on.

- [ ] **Step 1: Write the transactions migration**

Create `supabase/migrations/0003_transactions.sql`:

```sql
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  occurred_at timestamptz not null default now(),
  recurring_rule_id uuid,
  created_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "transactions_select_own" on public.transactions
  for select using (auth.uid() = user_id);

create policy "transactions_insert_own" on public.transactions
  for insert with check (auth.uid() = user_id);

create policy "transactions_update_own" on public.transactions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transactions_delete_own" on public.transactions
  for delete using (auth.uid() = user_id);

create index if not exists transactions_user_month_idx
  on public.transactions (user_id, occurred_at);
```

`recurring_rule_id` is left as a plain nullable `uuid` here (no foreign key yet) because `recurring_rules` doesn't exist until Task 8 — the FK constraint is added there.

- [ ] **Step 2: Push and verify**

```bash
npx supabase db push
```

Expected: CLI confirms `0003_transactions.sql` applied. Confirm in the dashboard that `transactions` exists with RLS enabled and 4 policies.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add transactions table migration"
```

---

### Task 8: `recurring_rules` migration + transactions FK

**Files:**
- Create: `supabase/migrations/0004_recurring_rules.sql`

**Interfaces:**
- Consumes: `public.categories(id)` (Task 5), `public.transactions(recurring_rule_id)` (Task 7).
- Produces: `public.recurring_rules` table that Task 18's `useRecurringRules` hook depends on; completes the `transactions.recurring_rule_id` foreign key.

- [ ] **Step 1: Write the recurring_rules migration**

Create `supabase/migrations/0004_recurring_rules.sql`:

```sql
create table if not exists public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  next_occurrence_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.recurring_rules enable row level security;

create policy "recurring_rules_select_own" on public.recurring_rules
  for select using (auth.uid() = user_id);

create policy "recurring_rules_insert_own" on public.recurring_rules
  for insert with check (auth.uid() = user_id);

create policy "recurring_rules_update_own" on public.recurring_rules
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recurring_rules_delete_own" on public.recurring_rules
  for delete using (auth.uid() = user_id);

alter table public.transactions
  add constraint transactions_recurring_rule_id_fkey
  foreign key (recurring_rule_id) references public.recurring_rules(id) on delete set null;
```

- [ ] **Step 2: Push and verify**

```bash
npx supabase db push
```

Expected: CLI confirms `0004_recurring_rules.sql` applied. Confirm in the dashboard that `recurring_rules` exists with RLS enabled and 4 policies, and that `transactions.recurring_rule_id` shows a foreign-key relationship to `recurring_rules.id` in the Table Editor's column detail view.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add recurring_rules table migration and transactions FK"
```

---

### Task 9: Seed default categories on signup

**Files:**
- Create: `supabase/migrations/0005_seed_default_categories.sql`

**Interfaces:**
- Consumes: `public.categories` (Task 5), Supabase's `auth.users` table.
- Produces: every new signup automatically gets 7 default categories, which Task 14's sign-up flow and Task 15's `useCategories` hook rely on being present.

- [ ] **Step 1: Write the seed trigger migration**

Create `supabase/migrations/0005_seed_default_categories.sql`:

```sql
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (user_id, name, color, icon, is_default) values
    (new.id, 'Groceries', '#4CAF50', 'cart', true),
    (new.id, 'Rent', '#2196F3', 'home', true),
    (new.id, 'Transport', '#FF9800', 'car', true),
    (new.id, 'Utilities', '#9C27B0', 'bolt', true),
    (new.id, 'Entertainment', '#E91E63', 'film', true),
    (new.id, 'Health', '#00BCD4', 'heart', true),
    (new.id, 'Other', '#607D8B', 'dots-horizontal', true);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_default_categories();
```

- [ ] **Step 2: Push the migration**

```bash
npx supabase db push
```

Expected: CLI confirms `0005_seed_default_categories.sql` applied.

- [ ] **Step 3: Verify the trigger fires**

In the Supabase dashboard, go to Authentication → Users and create a test user manually (Add User → with email/password). Then go to Table Editor → `categories` and filter by that user's `user_id`. Expected: 7 rows (Groceries, Rent, Transport, Utilities, Entertainment, Health, Other) were inserted automatically. Delete this test user afterward (Authentication → Users → delete) to keep the project clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: seed default categories for new users via auth trigger"
```

---

### Task 10: Budget status math (`sumTransactionsForCategory`, `computeBudgetStatus`)

**Files:**
- Create: `src/domain/budgetMath.ts`
- Test: `__tests__/domain/budgetMath.test.ts`

**Interfaces:**
- Consumes: `Transaction` type (`src/types/database.ts`, Task 3).
- Produces: `sumTransactionsForCategory(transactions: Transaction[], categoryId: string): number` and `computeBudgetStatus(budgeted: number, spent: number): BudgetStatus` where `BudgetStatus = { budgeted: number; spent: number; percentUsed: number; status: 'ok' | 'warning' | 'over' }`. Used by Task 20 (Overview screen) and Task 11 (threshold crossing, same file).

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/budgetMath.test.ts`:

```typescript
import { sumTransactionsForCategory, computeBudgetStatus } from '../../src/domain/budgetMath';
import type { Transaction } from '../../src/types/database';

function makeTransaction(overrides: Partial<Transaction>): Transaction {
  return {
    id: 't1',
    user_id: 'u1',
    category_id: 'groceries',
    amount: 10,
    note: null,
    occurred_at: '2026-07-01T00:00:00.000Z',
    recurring_rule_id: null,
    ...overrides,
  };
}

describe('sumTransactionsForCategory', () => {
  it('sums only transactions matching the given category', () => {
    const transactions = [
      makeTransaction({ category_id: 'groceries', amount: 25 }),
      makeTransaction({ category_id: 'rent', amount: 1000 }),
      makeTransaction({ category_id: 'groceries', amount: 15 }),
    ];

    expect(sumTransactionsForCategory(transactions, 'groceries')).toBe(40);
  });

  it('returns 0 when there are no matching transactions', () => {
    expect(sumTransactionsForCategory([], 'groceries')).toBe(0);
  });
});

describe('computeBudgetStatus', () => {
  it('returns "ok" when spend is below 80% of budget', () => {
    expect(computeBudgetStatus(100, 50)).toEqual({
      budgeted: 100,
      spent: 50,
      percentUsed: 50,
      status: 'ok',
    });
  });

  it('returns "warning" at exactly 80% of budget', () => {
    expect(computeBudgetStatus(100, 80)).toEqual({
      budgeted: 100,
      spent: 80,
      percentUsed: 80,
      status: 'warning',
    });
  });

  it('returns "over" at or above 100% of budget', () => {
    expect(computeBudgetStatus(100, 120)).toEqual({
      budgeted: 100,
      spent: 120,
      percentUsed: 120,
      status: 'over',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest budgetMath
```

Expected: FAIL with `Cannot find module '../../src/domain/budgetMath'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/domain/budgetMath.ts`:

```typescript
import type { Transaction } from '../types/database';

export function sumTransactionsForCategory(
  transactions: Transaction[],
  categoryId: string
): number {
  return transactions
    .filter((t) => t.category_id === categoryId)
    .reduce((total, t) => total + t.amount, 0);
}

export type BudgetStatusLevel = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  budgeted: number;
  spent: number;
  percentUsed: number;
  status: BudgetStatusLevel;
}

export function computeBudgetStatus(budgeted: number, spent: number): BudgetStatus {
  const percentUsed = budgeted === 0 ? (spent > 0 ? Infinity : 0) : (spent / budgeted) * 100;
  let status: BudgetStatusLevel = 'ok';
  if (percentUsed >= 100) status = 'over';
  else if (percentUsed >= 80) status = 'warning';
  return { budgeted, spent, percentUsed, status };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest budgetMath
```

Expected: PASS, 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add budget status aggregation math with tests"
```

---

### Task 11: Alert threshold-crossing logic (`didCrossThreshold`)

**Files:**
- Modify: `src/domain/budgetMath.ts`
- Test: `__tests__/domain/budgetMath.test.ts`

**Interfaces:**
- Produces: `didCrossThreshold(budgeted: number, previousSpent: number, newSpent: number): ThresholdCrossing` where `ThresholdCrossing = { crossed: boolean; threshold: 80 | 100 | null }`. Used by Task 27 (`useBudgetAlerts`, to decide whether to fire a notification).

- [ ] **Step 1: Write the failing test**

Append to `__tests__/domain/budgetMath.test.ts`:

```typescript
import { didCrossThreshold } from '../../src/domain/budgetMath';

describe('didCrossThreshold', () => {
  it('reports crossing 80% when spend moves from below to at/above it', () => {
    expect(didCrossThreshold(100, 70, 85)).toEqual({ crossed: true, threshold: 80 });
  });

  it('reports crossing 100% (not 80%) when spend jumps straight past both', () => {
    expect(didCrossThreshold(100, 50, 150)).toEqual({ crossed: true, threshold: 100 });
  });

  it('reports crossing 100% when already past 80% and now going over budget', () => {
    expect(didCrossThreshold(100, 85, 110)).toEqual({ crossed: true, threshold: 100 });
  });

  it('reports no crossing when spend stays below 80%', () => {
    expect(didCrossThreshold(100, 50, 60)).toEqual({ crossed: false, threshold: null });
  });

  it('reports no crossing when already over 100% and spend increases further', () => {
    expect(didCrossThreshold(100, 110, 130)).toEqual({ crossed: false, threshold: null });
  });

  it('reports no crossing when the budget is 0', () => {
    expect(didCrossThreshold(0, 0, 10)).toEqual({ crossed: false, threshold: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest budgetMath
```

Expected: FAIL with `didCrossThreshold is not a function` (or `undefined`).

- [ ] **Step 3: Write the minimal implementation**

Add to `src/domain/budgetMath.ts`:

```typescript
export type AlertThreshold = 80 | 100;

export interface ThresholdCrossing {
  crossed: boolean;
  threshold: AlertThreshold | null;
}

export function didCrossThreshold(
  budgeted: number,
  previousSpent: number,
  newSpent: number
): ThresholdCrossing {
  if (budgeted <= 0) return { crossed: false, threshold: null };

  const previousPercent = (previousSpent / budgeted) * 100;
  const newPercent = (newSpent / budgeted) * 100;

  if (previousPercent < 100 && newPercent >= 100) {
    return { crossed: true, threshold: 100 };
  }
  if (previousPercent < 80 && newPercent >= 80) {
    return { crossed: true, threshold: 80 };
  }
  return { crossed: false, threshold: null };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest budgetMath
```

Expected: PASS, 11 tests passing (5 from Task 10 + 6 from this task).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add alert threshold-crossing logic with tests"
```

---

### Task 12: Recurring-rule occurrence math (`computeNextOccurrence`, `getDueOccurrences`)

**Files:**
- Create: `src/domain/recurring.ts`
- Test: `__tests__/domain/recurring.test.ts`

**Interfaces:**
- Consumes: `RecurringFrequency` type (`src/types/database.ts`, Task 3).
- Produces: `computeNextOccurrence(currentDate: Date, frequency: RecurringFrequency): Date` and `getDueOccurrences(nextOccurrenceDate: Date, frequency: RecurringFrequency, asOf: Date): Date[]`. Used by Task 18 (`useRecurringRules` catch-up materialization).

- [ ] **Step 1: Write the failing test**

Create `__tests__/domain/recurring.test.ts`:

```typescript
import { computeNextOccurrence, getDueOccurrences } from '../../src/domain/recurring';

describe('computeNextOccurrence', () => {
  it('adds one week for weekly frequency', () => {
    expect(computeNextOccurrence(new Date('2026-07-01T00:00:00.000Z'), 'weekly')).toEqual(
      new Date('2026-07-08T00:00:00.000Z')
    );
  });

  it('adds one month for monthly frequency', () => {
    expect(computeNextOccurrence(new Date('2026-07-01T00:00:00.000Z'), 'monthly')).toEqual(
      new Date('2026-08-01T00:00:00.000Z')
    );
  });
});

describe('getDueOccurrences', () => {
  it('returns a single occurrence when exactly one period has passed', () => {
    const result = getDueOccurrences(
      new Date('2026-07-01T00:00:00.000Z'),
      'monthly',
      new Date('2026-07-15T00:00:00.000Z')
    );

    expect(result).toEqual([new Date('2026-07-01T00:00:00.000Z')]);
  });

  it('returns multiple occurrences when several periods have been missed', () => {
    const result = getDueOccurrences(
      new Date('2026-05-01T00:00:00.000Z'),
      'monthly',
      new Date('2026-07-15T00:00:00.000Z')
    );

    expect(result).toEqual([
      new Date('2026-05-01T00:00:00.000Z'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z'),
    ]);
  });

  it('returns an empty array when nothing is due yet', () => {
    const result = getDueOccurrences(
      new Date('2026-08-01T00:00:00.000Z'),
      'monthly',
      new Date('2026-07-15T00:00:00.000Z')
    );

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest recurring
```

Expected: FAIL with `Cannot find module '../../src/domain/recurring'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/domain/recurring.ts`:

```typescript
import { addWeeks, addMonths, isAfter } from 'date-fns';
import type { RecurringFrequency } from '../types/database';

export function computeNextOccurrence(currentDate: Date, frequency: RecurringFrequency): Date {
  return frequency === 'weekly' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1);
}

export function getDueOccurrences(
  nextOccurrenceDate: Date,
  frequency: RecurringFrequency,
  asOf: Date
): Date[] {
  const occurrences: Date[] = [];
  let cursor = nextOccurrenceDate;

  while (!isAfter(cursor, asOf)) {
    occurrences.push(cursor);
    cursor = computeNextOccurrence(cursor, frequency);
  }

  return occurrences;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest recurring
```

Expected: PASS, 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add recurring-rule occurrence math with tests"
```

---

### Task 13: Auth stack layout + Sign In screen

**Files:**
- Create: `app/(auth)/_layout.tsx`
- Create: `app/(auth)/sign-in.tsx`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`, Task 3).
- Produces: the `(auth)` route group the root layout (Task 4) redirects to when there's no session; a `/sign-in` route that Task 14's sign-up screen links back to.

- [ ] **Step 1: Write the auth stack layout**

Create `app/(auth)/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="sign-up" />
    </Stack>
  );
}
```

- [ ] **Step 2: Write the Sign In screen**

Create `app/(auth)/sign-in.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={handleSignIn} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? 'Signing in...' : 'Sign In'}</Text>
      </Pressable>
      <Link href="/sign-up" style={styles.link}>
        Don&apos;t have an account? Sign up
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
  link: { marginTop: 16, textAlign: 'center', color: '#2196F3' },
});
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add auth stack layout and sign-in screen"
```

---

### Task 14: Sign Up screen

**Files:**
- Create: `app/(auth)/sign-up.tsx`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase.ts`, Task 3).
- Produces: the `/sign-up` route linked from Task 13's sign-in screen. Relies on Task 9's `seed_default_categories` trigger to populate categories server-side — no client-side seeding call needed.

- [ ] **Step 1: Write the Sign Up screen**

Create `app/(auth)/sign-up.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSignUp() {
    setError(null);
    setSubmitting(true);
    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Check your email</Text>
        <Text>We sent a confirmation link to {email}. Confirm it, then sign in.</Text>
        <Link href="/sign-in" style={styles.link}>
          Back to sign in
        </Link>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign Up</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Pressable style={styles.button} onPress={handleSignUp} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? 'Creating account...' : 'Sign Up'}</Text>
      </Pressable>
      <Link href="/sign-in" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 12 },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
  link: { marginTop: 16, textAlign: 'center', color: '#2196F3' },
});
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add sign-up screen"
```

---

### Task 15: Selected-month UI store + `useCategories`

**Files:**
- Create: `src/stores/useUiStore.ts`
- Create: `src/hooks/useCategories.ts`

**Interfaces:**
- Produces: `useUiStore(): { selectedMonth: string; setSelectedMonth: (month: string) => void }` (month format: ISO date string for the first of the month, e.g. `2026-07-01`) — read directly by the screens in Tasks 20-24 (Overview, Add/Edit Transaction, Transactions list, Budget editor, Reports) and by Task 27's tabs-layout alert wiring. Also produces `useCategories(): UseQueryResult<Category[]>`, consumed by Tasks 20-26.

- [ ] **Step 1: Write the UI store**

Create `src/stores/useUiStore.ts`:

```typescript
import { create } from 'zustand';
import { startOfMonth, formatISO } from 'date-fns';

function currentMonthKey(): string {
  return formatISO(startOfMonth(new Date()), { representation: 'date' });
}

interface UiState {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedMonth: currentMonthKey(),
  setSelectedMonth: (month) => set({ selectedMonth: month }),
}));
```

- [ ] **Step 2: Write the categories hook**

Create `src/hooks/useCategories.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Category } from '../types/database';

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add UI store for selected month and categories query hook"
```

---

### Task 16: `useBudgets` and `useSetBudget`

**Files:**
- Create: `src/hooks/useBudgets.ts`

**Interfaces:**
- Consumes: `Budget` type (Task 3).
- Produces: `useBudgets(month: string): UseQueryResult<Budget[]>` and `useSetBudget(): UseMutationResult` accepting `{ categoryId: string; month: string; amount: number }`. Consumed by Task 20 (Overview) and Task 23 (Budget editor).

- [ ] **Step 1: Write the budgets hooks**

Create `src/hooks/useBudgets.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Budget } from '../types/database';

export function useBudgets(month: string) {
  return useQuery({
    queryKey: ['budgets', month],
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase.from('budgets').select('*').eq('month', month);
      if (error) throw error;
      return data;
    },
  });
}

export interface SetBudgetInput {
  categoryId: string;
  month: string;
  amount: number;
}

export function useSetBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ categoryId, month, amount }: SetBudgetInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('budgets').upsert(
        {
          user_id: userData.user.id,
          category_id: categoryId,
          month,
          amount,
        },
        { onConflict: 'user_id,category_id,month' }
      );

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budgets', variables.month] });
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add budgets query hook and set-budget mutation"
```

---

### Task 17: `useTransactions` with add/update/delete mutations

**Files:**
- Create: `src/hooks/useTransactions.ts`

**Interfaces:**
- Consumes: `Transaction` type (Task 3).
- Produces: `useTransactions(month: string): UseQueryResult<Transaction[]>`, `useAddTransaction(month: string)`, `useUpdateTransaction(month: string)`, `useDeleteTransaction(month: string)`. Add/update apply an optimistic cache update in `onMutate` (rolled back in `onError` via the returned `previousTransactions` context) before invalidating `['transactions', month]` on success; delete invalidates on success only. Consumed by Task 20 (Overview), Task 21 (Add/Edit Transaction), Task 22 (Transactions list), Task 24 (Reports), and Task 27 (alert wiring reads the same cached data).

- [ ] **Step 1: Write the transactions hooks**

Create `src/hooks/useTransactions.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Transaction } from '../types/database';

function monthRange(month: string) {
  const start = new Date(`${month}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function useTransactions(month: string) {
  const { start, end } = monthRange(month);

  return useQuery({
    queryKey: ['transactions', month],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('occurred_at', start)
        .lt('occurred_at', end)
        .order('occurred_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export interface AddTransactionInput {
  categoryId: string;
  amount: number;
  note: string | null;
  occurredAt: string;
}

interface AddTransactionContext {
  previousTransactions: Transaction[] | undefined;
}

export function useAddTransaction(month: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, AddTransactionInput, AddTransactionContext>({
    mutationFn: async ({ categoryId, amount, note, occurredAt }: AddTransactionInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('transactions').insert({
        user_id: userData.user.id,
        category_id: categoryId,
        amount,
        note,
        occurred_at: occurredAt,
      });

      if (error) throw error;
    },
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', month] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(['transactions', month]);

      const optimisticTransaction: Transaction = {
        id: `optimistic-${Date.now()}`,
        user_id: '',
        category_id: newTransaction.categoryId,
        amount: newTransaction.amount,
        note: newTransaction.note,
        occurred_at: newTransaction.occurredAt,
        recurring_rule_id: null,
      };

      queryClient.setQueryData<Transaction[]>(['transactions', month], (old) => [
        optimisticTransaction,
        ...(old ?? []),
      ]);

      return { previousTransactions };
    },
    onError: (_err, _newTransaction, context) => {
      if (context) {
        queryClient.setQueryData(['transactions', month], context.previousTransactions);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] });
    },
  });
}

export interface UpdateTransactionInput {
  id: string;
  categoryId: string;
  amount: number;
  note: string | null;
  occurredAt: string;
}

interface UpdateTransactionContext {
  previousTransactions: Transaction[] | undefined;
}

export function useUpdateTransaction(month: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateTransactionInput, UpdateTransactionContext>({
    mutationFn: async ({ id, categoryId, amount, note, occurredAt }: UpdateTransactionInput) => {
      const { error } = await supabase
        .from('transactions')
        .update({ category_id: categoryId, amount, note, occurred_at: occurredAt })
        .eq('id', id);

      if (error) throw error;
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', month] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(['transactions', month]);

      queryClient.setQueryData<Transaction[]>(['transactions', month], (old) =>
        (old ?? []).map((transaction) =>
          transaction.id === updated.id
            ? {
                ...transaction,
                category_id: updated.categoryId,
                amount: updated.amount,
                note: updated.note,
                occurred_at: updated.occurredAt,
              }
            : transaction
        )
      );

      return { previousTransactions };
    },
    onError: (_err, _updated, context) => {
      if (context) {
        queryClient.setQueryData(['transactions', month], context.previousTransactions);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] });
    },
  });
}

export function useDeleteTransaction(month: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] });
    },
  });
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add transactions query hook and add/update/delete mutations"
```

---

### Task 18: `useRecurringRules` and client-side catch-up materialization

**Files:**
- Create: `src/hooks/useRecurringRules.ts`

**Interfaces:**
- Consumes: `RecurringRule` type (Task 3), `getDueOccurrences` and `computeNextOccurrence` (`src/domain/recurring.ts`, Task 12).
- Produces: `useRecurringRules(): UseQueryResult<RecurringRule[]>` and `useRecurringCatchUp(): void` — a hook with no return value that, as a side effect, materializes any due recurring transactions once per mount and invalidates `transactions`/`recurringRules` queries. Consumed by Task 19 (called once in the tabs layout so it runs on every app foreground) and Task 26 (recurring rules management screen re-uses `useRecurringRules`, and adds mutations to this same file).

- [ ] **Step 1: Write the recurring rules hook and catch-up logic**

Create `src/hooks/useRecurringRules.ts`:

```typescript
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { RecurringRule } from '../types/database';
import { getDueOccurrences, computeNextOccurrence } from '../domain/recurring';

export function useRecurringRules() {
  return useQuery({
    queryKey: ['recurringRules'],
    queryFn: async (): Promise<RecurringRule[]> => {
      const { data, error } = await supabase.from('recurring_rules').select('*');

      if (error) throw error;
      return data;
    },
  });
}

async function materializeRule(rule: RecurringRule): Promise<void> {
  const dueDates = getDueOccurrences(
    new Date(rule.next_occurrence_date),
    rule.frequency,
    new Date()
  );

  if (dueDates.length === 0) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const rows = dueDates.map((date) => ({
    user_id: userData.user.id,
    category_id: rule.category_id,
    amount: rule.amount,
    note: rule.note,
    occurred_at: date.toISOString(),
    recurring_rule_id: rule.id,
  }));

  const { error: insertError } = await supabase.from('transactions').insert(rows);
  if (insertError) throw insertError;

  const lastDue = dueDates[dueDates.length - 1];
  const nextOccurrence = computeNextOccurrence(lastDue, rule.frequency);

  const { error: updateError } = await supabase
    .from('recurring_rules')
    .update({ next_occurrence_date: nextOccurrence.toISOString().slice(0, 10) })
    .eq('id', rule.id);

  if (updateError) throw updateError;
}

export function useRecurringCatchUp(): void {
  const queryClient = useQueryClient();
  const { data: rules } = useRecurringRules();

  const { mutate: runCatchUp } = useMutation({
    mutationFn: async (dueRules: RecurringRule[]) => {
      for (const rule of dueRules) {
        await materializeRule(rule);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });

  useEffect(() => {
    const activeRules = (rules ?? []).filter((rule) => rule.active);
    if (activeRules.length > 0) {
      runCatchUp(activeRules);
    }
  }, [rules, runCatchUp]);
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add recurring rules hook with client-side catch-up materialization"
```

---

### Task 19: Tabs layout

**Files:**
- Create: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `useRecurringCatchUp` (`src/hooks/useRecurringRules.ts`, Task 18).
- Produces: the `(tabs)` route group the root layout (Task 4) redirects to once authenticated, with 4 named routes (`index`, `transactions`, `reports`, `settings`) that Tasks 20-24 implement.

- [ ] **Step 1: Write the tabs layout**

Create `app/(tabs)/_layout.tsx`:

```typescript
import { Tabs } from 'expo-router';
import { useRecurringCatchUp } from '../../src/hooks/useRecurringRules';

export default function TabsLayout() {
  useRecurringCatchUp();

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors. (Screens referenced by `Tabs.Screen` don't exist yet — that's expected until Tasks 20-24; Expo Router won't error at compile time for this.)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add 4-tab main layout with recurring catch-up wired in"
```

---

### Task 20: Overview screen

**Files:**
- Create: `app/(tabs)/index.tsx`
- Create: `src/components/CategoryProgressBar.tsx`
- Create: `src/components/AlertBanner.tsx`
- Test: `__tests__/components/Overview.test.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 15), `useBudgets` (Task 16), `useTransactions` (Task 17), `useUiStore` (Task 15), `sumTransactionsForCategory`/`computeBudgetStatus`/`BudgetStatus` (Task 10).
- Produces: the `(tabs)/index` route (Overview tab); `CategoryProgressBar` and `AlertBanner` components, reused nowhere else in v1 but kept as separate files per the file-structure decomposition.

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/Overview.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react-native';
import OverviewScreen from '../../app/(tabs)/index';

jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => ({
    data: [
      { id: 'cat-1', user_id: 'u1', name: 'Groceries', color: '#4CAF50', icon: 'cart', is_default: true },
      { id: 'cat-2', user_id: 'u1', name: 'Rent', color: '#2196F3', icon: 'home', is_default: true },
    ],
  }),
}));

jest.mock('../../src/hooks/useBudgets', () => ({
  useBudgets: () => ({
    data: [
      { id: 'b1', user_id: 'u1', category_id: 'cat-1', month: '2026-07-01', amount: 200 },
      { id: 'b2', user_id: 'u1', category_id: 'cat-2', month: '2026-07-01', amount: 1000 },
    ],
  }),
}));

jest.mock('../../src/hooks/useTransactions', () => ({
  useTransactions: () => ({
    data: [
      { id: 't1', user_id: 'u1', category_id: 'cat-1', amount: 180, note: null, occurred_at: '2026-07-05T00:00:00.000Z', recurring_rule_id: null },
      { id: 't2', user_id: 'u1', category_id: 'cat-2', amount: 1200, note: null, occurred_at: '2026-07-01T00:00:00.000Z', recurring_rule_id: null },
    ],
  }),
}));

jest.mock('../../src/stores/useUiStore', () => ({
  useUiStore: (selector: (state: { selectedMonth: string }) => unknown) =>
    selector({ selectedMonth: '2026-07-01' }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

describe('OverviewScreen', () => {
  it('shows spend vs budget for each category', () => {
    render(<OverviewScreen />);

    expect(screen.getByText('Groceries')).toBeTruthy();
    expect(screen.getByText('$180.00 / $200.00')).toBeTruthy();
    expect(screen.getByText('Rent')).toBeTruthy();
    expect(screen.getByText('$1200.00 / $1000.00')).toBeTruthy();
  });

  it('shows an alert banner only for categories that are over budget', () => {
    render(<OverviewScreen />);

    expect(screen.getByText('Rent is over budget')).toBeTruthy();
    expect(screen.queryByText('Groceries is over budget')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest Overview
```

Expected: FAIL — `app/(tabs)/index.tsx` doesn't exist yet.

- [ ] **Step 3: Write the progress bar and alert banner components**

Create `src/components/CategoryProgressBar.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';
import type { BudgetStatus } from '../domain/budgetMath';

interface Props {
  categoryName: string;
  status: BudgetStatus;
}

const STATUS_COLORS: Record<BudgetStatus['status'], string> = {
  ok: '#4CAF50',
  warning: '#FF9800',
  over: '#D32F2F',
};

export function CategoryProgressBar({ categoryName, status }: Props) {
  const fillWidth = `${Math.min(status.percentUsed, 100)}%`;

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.name}>{categoryName}</Text>
        <Text style={styles.amounts}>
          ${status.spent.toFixed(2)} / ${status.budgeted.toFixed(2)}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fill, { width: fillWidth, backgroundColor: STATUS_COLORS[status.status] }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontWeight: '600' },
  amounts: { color: '#555' },
  track: { height: 8, borderRadius: 4, backgroundColor: '#eee', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
});
```

Create `src/components/AlertBanner.tsx`:

```typescript
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  message: string;
}

export function AlertBanner({ message }: Props) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 12 },
  text: { color: '#E65100', fontWeight: '600' },
});
```

- [ ] **Step 4: Write the Overview screen**

Create `app/(tabs)/index.tsx`:

```typescript
import { ScrollView, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useBudgets } from '../../src/hooks/useBudgets';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useUiStore } from '../../src/stores/useUiStore';
import { sumTransactionsForCategory, computeBudgetStatus } from '../../src/domain/budgetMath';
import { CategoryProgressBar } from '../../src/components/CategoryProgressBar';
import { AlertBanner } from '../../src/components/AlertBanner';

export default function OverviewScreen() {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(selectedMonth);
  const { data: transactions } = useTransactions(selectedMonth);

  const rows = (categories ?? []).map((category) => {
    const budget = (budgets ?? []).find((b) => b.category_id === category.id);
    const spent = sumTransactionsForCategory(transactions ?? [], category.id);
    const status = computeBudgetStatus(budget?.amount ?? 0, spent);
    return { category, status };
  });

  const overBudgetRows = rows.filter((row) => row.status.status === 'over');

  return (
    <ScrollView style={styles.container}>
      {overBudgetRows.map((row) => (
        <AlertBanner key={row.category.id} message={`${row.category.name} is over budget`} />
      ))}
      {rows.map((row) => (
        <Pressable key={row.category.id} onPress={() => router.push(`/budget/${row.category.id}`)}>
          <CategoryProgressBar categoryName={row.category.name} status={row.status} />
        </Pressable>
      ))}
      <Pressable style={styles.fab} onPress={() => router.push('/transaction/new')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx jest Overview
```

Expected: PASS, 2 tests passing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Overview screen with per-category progress bars and over-budget alerts"
```

---

### Task 21: Add/Edit Transaction screens

**Files:**
- Create: `src/components/TransactionForm.tsx`
- Create: `app/transaction/new.tsx`
- Create: `app/transaction/[id].tsx`
- Test: `__tests__/components/AddTransactionForm.test.tsx`

**Interfaces:**
- Consumes: `Category` type (Task 3), `useCategories` (Task 15), `useAddTransaction`/`useUpdateTransaction`/`useDeleteTransaction` (Task 17), `useUiStore` (Task 15).
- Produces: `TransactionForm` component with props `{ categories: Category[]; initialValues?: { categoryId: string; amount: string; note: string }; submitLabel: string; onSubmit: (values: { categoryId: string; amount: number; note: string | null }) => void }`, reused by both routes below. Produces the `/transaction/new` and `/transaction/[id]` routes, pushed to from Task 20 (Overview FAB) and Task 22 (Transactions list, tapping a row).

- [ ] **Step 1: Write the failing test**

Create `__tests__/components/AddTransactionForm.test.tsx`:

```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';
import { TransactionForm } from '../../src/components/TransactionForm';
import type { Category } from '../../src/types/database';

const categories: Category[] = [
  { id: 'cat-1', user_id: 'u1', name: 'Groceries', color: '#4CAF50', icon: 'cart', is_default: true },
];

describe('TransactionForm', () => {
  it('calls onSubmit with parsed values when input is valid', () => {
    const onSubmit = jest.fn();
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '42.50');
    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).toHaveBeenCalledWith({ categoryId: 'cat-1', amount: 42.5, note: null });
  });

  it('blocks submit and shows an error when amount is empty', () => {
    const onSubmit = jest.fn();
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={onSubmit} />);

    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Amount must be a number greater than 0')).toBeTruthy();
  });

  it('blocks submit when amount is zero or negative', () => {
    const onSubmit = jest.fn();
    render(<TransactionForm categories={categories} submitLabel="Add Transaction" onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '-5');
    fireEvent.press(screen.getByText('Add Transaction'));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Amount must be a number greater than 0')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx jest AddTransactionForm
```

Expected: FAIL — `src/components/TransactionForm.tsx` doesn't exist yet.

- [ ] **Step 3: Write the form component**

Create `src/components/TransactionForm.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { Category } from '../types/database';

export interface TransactionFormValues {
  categoryId: string;
  amount: string;
  note: string;
}

interface Props {
  categories: Category[];
  initialValues?: TransactionFormValues;
  submitLabel: string;
  onSubmit: (values: { categoryId: string; amount: number; note: string | null }) => void;
}

export function TransactionForm({ categories, initialValues, submitLabel, onSubmit }: Props) {
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const parsedAmount = Number(amount);

    if (!categoryId) {
      setError('Please choose a category');
      return;
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a number greater than 0');
      return;
    }

    setError(null);
    onSubmit({ categoryId, amount: parsedAmount, note: note.trim() ? note.trim() : null });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryRow}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={[
              styles.categoryChip,
              { borderColor: category.color },
              categoryId === category.id && { backgroundColor: category.color },
            ]}
          >
            <Text style={categoryId === category.id ? styles.categoryChipTextSelected : styles.categoryChipText}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" />
      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  categoryChipText: { color: '#333' },
  categoryChipTextSelected: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx jest AddTransactionForm
```

Expected: PASS, 3 tests passing.

- [ ] **Step 5: Write the Add Transaction screen**

Create `app/transaction/new.tsx`:

```typescript
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useAddTransaction } from '../../src/hooks/useTransactions';
import { useUiStore } from '../../src/stores/useUiStore';
import { TransactionForm } from '../../src/components/TransactionForm';

export default function NewTransactionScreen() {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: addTransaction } = useAddTransaction(selectedMonth);

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <TransactionForm
      categories={categories}
      submitLabel="Add Transaction"
      onSubmit={({ categoryId, amount, note }) => {
        addTransaction(
          { categoryId, amount, note, occurredAt: new Date().toISOString() },
          { onSuccess: () => router.back() }
        );
      }}
    />
  );
}
```

- [ ] **Step 6: Write the Edit Transaction screen**

Create `app/transaction/[id].tsx`:

```typescript
import { View, ActivityIndicator, Pressable, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useUpdateTransaction, useDeleteTransaction } from '../../src/hooks/useTransactions';
import { useUiStore } from '../../src/stores/useUiStore';
import { TransactionForm } from '../../src/components/TransactionForm';

export default function EditTransactionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    categoryId: string;
    amount: string;
    note: string;
    occurredAt: string;
  }>();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { mutate: updateTransaction } = useUpdateTransaction(selectedMonth);
  const { mutate: deleteTransaction } = useDeleteTransaction(selectedMonth);

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TransactionForm
        categories={categories}
        initialValues={{ categoryId: params.categoryId, amount: params.amount, note: params.note }}
        submitLabel="Save Changes"
        onSubmit={({ categoryId, amount, note }) => {
          updateTransaction(
            { id: params.id, categoryId, amount, note, occurredAt: params.occurredAt },
            { onSuccess: () => router.back() }
          );
        }}
      />
      <Pressable
        style={styles.deleteButton}
        onPress={() => deleteTransaction(params.id, { onSuccess: () => router.back() })}
      >
        <Text style={styles.deleteText}>Delete Transaction</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  deleteButton: { padding: 16, alignItems: 'center' },
  deleteText: { color: '#D32F2F', fontWeight: '600' },
});
```

- [ ] **Step 7: Verify everything compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add transaction form component and add/edit transaction screens"
```

---

### Task 22: Transactions list screen

**Files:**
- Create: `app/(tabs)/transactions.tsx`
- Create: `src/components/TransactionListItem.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 15), `useTransactions` (Task 17), `useUiStore` (Task 15).
- Produces: the `(tabs)/transactions` route (Transactions tab); `TransactionListItem` component.

- [ ] **Step 1: Write the list item component**

Create `src/components/TransactionListItem.tsx`:

```typescript
import { Pressable, Text, View, StyleSheet } from 'react-native';
import { format } from 'date-fns';
import type { Transaction, Category } from '../types/database';

interface Props {
  transaction: Transaction;
  category: Category | undefined;
  onPress: () => void;
}

export function TransactionListItem({ transaction, category, onPress }: Props) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View>
        <Text style={styles.category}>{category?.name ?? 'Unknown'}</Text>
        {transaction.note ? <Text style={styles.note}>{transaction.note}</Text> : null}
        <Text style={styles.date}>{format(new Date(transaction.occurred_at), 'MMM d')}</Text>
      </View>
      <Text style={styles.amount}>${transaction.amount.toFixed(2)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  category: { fontWeight: '600' },
  note: { color: '#666' },
  date: { color: '#999', fontSize: 12 },
  amount: { fontWeight: '700' },
});
```

- [ ] **Step 2: Write the Transactions screen**

Create `app/(tabs)/transactions.tsx`:

```typescript
import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useUiStore } from '../../src/stores/useUiStore';
import { TransactionListItem } from '../../src/components/TransactionListItem';

export default function TransactionsScreen() {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: transactions } = useTransactions(selectedMonth);

  return (
    <View style={styles.container}>
      <FlatList
        data={transactions ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TransactionListItem
            transaction={item}
            category={(categories ?? []).find((c) => c.id === item.category_id)}
            onPress={() =>
              router.push({
                pathname: '/transaction/[id]',
                params: {
                  id: item.id,
                  categoryId: item.category_id,
                  amount: String(item.amount),
                  note: item.note ?? '',
                  occurredAt: item.occurred_at,
                },
              })
            }
          />
        )}
      />
      <Pressable style={styles.fab} onPress={() => router.push('/transaction/new')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add transactions list screen"
```

---

### Task 23: Budget editor screen

**Files:**
- Create: `app/budget/[categoryId].tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 15), `useBudgets`/`useSetBudget` (Task 16), `useUiStore` (Task 15).
- Produces: the `/budget/[categoryId]` route, pushed to from Task 20 (Overview, tapping a category).

- [ ] **Step 1: Write the budget editor screen**

Create `app/budget/[categoryId].tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useBudgets, useSetBudget } from '../../src/hooks/useBudgets';
import { useUiStore } from '../../src/stores/useUiStore';

export default function EditBudgetScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(selectedMonth);
  const { mutate: setBudget } = useSetBudget();

  const category = (categories ?? []).find((c) => c.id === categoryId);
  const existingBudget = (budgets ?? []).find((b) => b.category_id === categoryId);
  const [amount, setAmount] = useState(existingBudget ? String(existingBudget.amount) : '');
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Budget must be a number of 0 or more');
      return;
    }
    setError(null);
    setBudget(
      { categoryId, month: selectedMonth, amount: parsedAmount },
      { onSuccess: () => router.back() }
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{category?.name ?? 'Category'} Budget</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Pressable style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Save Budget</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, marginBottom: 16 },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add per-category budget editor screen"
```

---

### Task 24: Reports screen with charts

**Files:**
- Create: `src/hooks/useMonthlyTotals.ts`
- Create: `src/components/SpendByCategoryChart.tsx`
- Create: `src/components/MonthlyTrendChart.tsx`
- Create: `app/(tabs)/reports.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 15), `useTransactions` (Task 17), `useUiStore` (Task 15), `sumTransactionsForCategory` (Task 10).
- Produces: `useMonthlyTotals(monthsBack: number): UseQueryResult<MonthlyTotal[]>` where `MonthlyTotal = { month: string; total: number }`; the `(tabs)/reports` route.

- [ ] **Step 1: Write the monthly totals hook**

Create `src/hooks/useMonthlyTotals.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { startOfMonth, subMonths, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';

export interface MonthlyTotal {
  month: string;
  total: number;
}

export function useMonthlyTotals(monthsBack: number) {
  const earliestMonth = formatISO(startOfMonth(subMonths(new Date(), monthsBack - 1)), {
    representation: 'date',
  });

  return useQuery({
    queryKey: ['monthlyTotals', earliestMonth],
    queryFn: async (): Promise<MonthlyTotal[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, occurred_at')
        .gte('occurred_at', `${earliestMonth}T00:00:00.000Z`);

      if (error) throw error;

      const totalsByMonth = new Map<string, number>();
      for (const row of data) {
        const monthKey = formatISO(startOfMonth(new Date(row.occurred_at)), { representation: 'date' });
        totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) ?? 0) + row.amount);
      }

      const months: MonthlyTotal[] = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthKey = formatISO(startOfMonth(subMonths(new Date(), i)), { representation: 'date' });
        months.push({ month: monthKey, total: totalsByMonth.get(monthKey) ?? 0 });
      }

      return months;
    },
  });
}
```

- [ ] **Step 2: Write the chart components**

Create `src/components/SpendByCategoryChart.tsx`:

```typescript
import { View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';
import type { Category, Transaction } from '../types/database';
import { sumTransactionsForCategory } from '../domain/budgetMath';

interface Props {
  categories: Category[];
  transactions: Transaction[];
}

export function SpendByCategoryChart({ categories, transactions }: Props) {
  const data = categories
    .map((category) => ({
      value: sumTransactionsForCategory(transactions, category.id),
      color: category.color,
      text: category.name,
    }))
    .filter((slice) => slice.value > 0);

  return (
    <View>
      <PieChart data={data} donut radius={90} innerRadius={55} />
    </View>
  );
}
```

Create `src/components/MonthlyTrendChart.tsx`:

```typescript
import { View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { format } from 'date-fns';
import type { MonthlyTotal } from '../hooks/useMonthlyTotals';

interface Props {
  totals: MonthlyTotal[];
}

export function MonthlyTrendChart({ totals }: Props) {
  const data = totals.map((entry) => ({
    value: entry.total,
    label: format(new Date(`${entry.month}T00:00:00.000Z`), 'MMM'),
  }));

  return (
    <View>
      <BarChart data={data} barWidth={24} spacing={16} roundedTop />
    </View>
  );
}
```

- [ ] **Step 3: Write the Reports screen**

Create `app/(tabs)/reports.tsx`:

```typescript
import { ScrollView, Text, StyleSheet } from 'react-native';
import { useCategories } from '../../src/hooks/useCategories';
import { useTransactions } from '../../src/hooks/useTransactions';
import { useMonthlyTotals } from '../../src/hooks/useMonthlyTotals';
import { useUiStore } from '../../src/stores/useUiStore';
import { SpendByCategoryChart } from '../../src/components/SpendByCategoryChart';
import { MonthlyTrendChart } from '../../src/components/MonthlyTrendChart';

export default function ReportsScreen() {
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: transactions } = useTransactions(selectedMonth);
  const { data: monthlyTotals } = useMonthlyTotals(6);

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Spend by Category</Text>
      <SpendByCategoryChart categories={categories ?? []} transactions={transactions ?? []} />
      <Text style={styles.heading}>Last 6 Months</Text>
      <MonthlyTrendChart totals={monthlyTotals ?? []} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 16, marginBottom: 8 },
});
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add reports screen with spend-by-category and monthly trend charts"
```

---

### Task 25: Category management (add/rename/recolor) + Settings screen

**Files:**
- Modify: `src/hooks/useCategories.ts`
- Create: `src/components/CategoryForm.tsx`
- Create: `app/category/new.tsx`
- Create: `app/category/[id].tsx`
- Create: `app/(tabs)/settings.tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 15), `supabase` (Task 3).
- Produces: `useAddCategory()` and `useUpdateCategory()` mutation hooks (added to `useCategories.ts`); `CategoryForm` component with props `{ initialValues?: { name: string; color: string }; submitLabel: string; onSubmit: (values: { name: string; color: string }) => void }`; the `/category/new`, `/category/[id]`, and `(tabs)/settings` routes. Task 26 modifies `settings.tsx` further to add the recurring-rules section.

- [ ] **Step 1: Add category mutations**

Modify `src/hooks/useCategories.ts` — add to the existing file (keep the existing `useCategories` query as-is):

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface AddCategoryInput {
  name: string;
  color: string;
}

export function useAddCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, color }: AddCategoryInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('categories').insert({
        user_id: userData.user.id,
        name,
        color,
        icon: 'tag',
        is_default: false,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}

export interface UpdateCategoryInput {
  id: string;
  name: string;
  color: string;
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, color }: UpdateCategoryInput) => {
      const { error } = await supabase.from('categories').update({ name, color }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
}
```

The final `src/hooks/useCategories.ts` should have one `import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';` line at the top (merge the new import with the existing `useQuery` import rather than duplicating it).

- [ ] **Step 2: Write the category form**

Create `src/components/CategoryForm.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

const COLOR_OPTIONS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#607D8B'];

export interface CategoryFormValues {
  name: string;
  color: string;
}

interface Props {
  initialValues?: CategoryFormValues;
  submitLabel: string;
  onSubmit: (values: CategoryFormValues) => void;
}

export function CategoryForm({ initialValues, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [color, setColor] = useState(initialValues?.color ?? COLOR_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    onSubmit({ name: name.trim(), color });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Category name" />
      <Text style={styles.label}>Color</Text>
      <View style={styles.colorRow}>
        {COLOR_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setColor(option)}
            style={[styles.swatch, { backgroundColor: option }, color === option && styles.swatchSelected]}
          />
        ))}
      </View>
      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  colorRow: { flexDirection: 'row', gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchSelected: { borderWidth: 3, borderColor: '#000' },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
```

- [ ] **Step 3: Write the add/edit category screens**

Create `app/category/new.tsx`:

```typescript
import { useRouter } from 'expo-router';
import { CategoryForm } from '../../src/components/CategoryForm';
import { useAddCategory } from '../../src/hooks/useCategories';

export default function NewCategoryScreen() {
  const router = useRouter();
  const { mutate: addCategory } = useAddCategory();

  return (
    <CategoryForm
      submitLabel="Add Category"
      onSubmit={(values) => addCategory(values, { onSuccess: () => router.back() })}
    />
  );
}
```

Create `app/category/[id].tsx`:

```typescript
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CategoryForm } from '../../src/components/CategoryForm';
import { useUpdateCategory } from '../../src/hooks/useCategories';

export default function EditCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string; color: string }>();
  const { mutate: updateCategory } = useUpdateCategory();

  return (
    <CategoryForm
      initialValues={{ name: params.name, color: params.color }}
      submitLabel="Save Changes"
      onSubmit={(values) => updateCategory({ id: params.id, ...values }, { onSuccess: () => router.back() })}
    />
  );
}
```

- [ ] **Step 4: Write the Settings screen**

Create `app/(tabs)/settings.tsx`:

```typescript
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { supabase } from '../../src/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const { data: categories } = useCategories();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Categories</Text>
      {(categories ?? []).map((category) => (
        <Pressable
          key={category.id}
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: '/category/[id]',
              params: { id: category.id, name: category.name, color: category.color },
            })
          }
        >
          <View style={[styles.swatch, { backgroundColor: category.color }]} />
          <Text style={styles.rowText}>{category.name}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.addButton} onPress={() => router.push('/category/new')}>
        <Text style={styles.addButtonText}>+ Add Category</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  swatch: { width: 20, height: 20, borderRadius: 10, marginRight: 12 },
  rowText: { fontSize: 16 },
  addButton: { paddingVertical: 12 },
  addButtonText: { color: '#2196F3', fontWeight: '600' },
  signOutButton: { marginTop: 32, padding: 14, alignItems: 'center' },
  signOutText: { color: '#D32F2F', fontWeight: '600' },
});
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add category management and settings screen"
```

---

### Task 26: Recurring rule management (create/edit/pause)

**Files:**
- Modify: `src/hooks/useRecurringRules.ts`
- Modify: `app/(tabs)/settings.tsx`
- Create: `src/components/RecurringRuleForm.tsx`
- Create: `app/recurring/new.tsx`
- Create: `app/recurring/[id].tsx`

**Interfaces:**
- Consumes: `useCategories` (Task 15), `RecurringFrequency` type (Task 3), `useRecurringRules` (Task 18).
- Produces: `useAddRecurringRule()`, `useUpdateRecurringRule()`, `useSetRecurringRuleActive()` mutation hooks (added to `useRecurringRules.ts`); `RecurringRuleForm` component; the `/recurring/new` and `/recurring/[id]` routes; a "Recurring Rules" section added to the Settings screen.

- [ ] **Step 1: Add recurring rule mutations**

Modify `src/hooks/useRecurringRules.ts` — change the top import line to include `formatISO`:

```typescript
import { formatISO } from 'date-fns';
```

Then add these exports:

```typescript
export interface AddRecurringRuleInput {
  categoryId: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
}

export function useAddRecurringRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ categoryId, amount, note, frequency }: AddRecurringRuleInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('recurring_rules').insert({
        user_id: userData.user.id,
        category_id: categoryId,
        amount,
        note,
        frequency,
        next_occurrence_date: formatISO(new Date(), { representation: 'date' }),
        active: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });
}

export interface UpdateRecurringRuleInput {
  id: string;
  categoryId: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
}

export function useUpdateRecurringRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, categoryId, amount, note, frequency }: UpdateRecurringRuleInput) => {
      const { error } = await supabase
        .from('recurring_rules')
        .update({ category_id: categoryId, amount, note, frequency })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });
}

export function useSetRecurringRuleActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('recurring_rules').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });
}
```

- [ ] **Step 2: Write the recurring rule form**

Create `src/components/RecurringRuleForm.tsx`:

```typescript
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { Category, RecurringFrequency } from '../types/database';

export interface RecurringRuleFormValues {
  categoryId: string;
  amount: string;
  note: string;
  frequency: RecurringFrequency;
}

interface Props {
  categories: Category[];
  initialValues?: RecurringRuleFormValues;
  submitLabel: string;
  onSubmit: (values: {
    categoryId: string;
    amount: number;
    note: string | null;
    frequency: RecurringFrequency;
  }) => void;
}

export function RecurringRuleForm({ categories, initialValues, submitLabel, onSubmit }: Props) {
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(initialValues?.frequency ?? 'monthly');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const parsedAmount = Number(amount);
    if (!categoryId) {
      setError('Please choose a category');
      return;
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a number greater than 0');
      return;
    }
    setError(null);
    onSubmit({ categoryId, amount: parsedAmount, note: note.trim() ? note.trim() : null, frequency });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Category</Text>
      <View style={styles.optionRow}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={[
              styles.chip,
              { borderColor: category.color },
              categoryId === category.id && { backgroundColor: category.color },
            ]}
          >
            <Text style={categoryId === category.id ? styles.chipTextSelected : styles.chipText}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" />
      <Text style={styles.label}>Frequency</Text>
      <View style={styles.optionRow}>
        {(['weekly', 'monthly'] as RecurringFrequency[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setFrequency(option)}
            style={[styles.chip, frequency === option && styles.chipSelected]}
          >
            <Text style={frequency === option ? styles.chipTextSelected : styles.chipText}>
              {option === 'weekly' ? 'Weekly' : 'Monthly'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  chipText: { color: '#333' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
```

- [ ] **Step 3: Write the add/edit recurring rule screens**

Create `app/recurring/new.tsx`:

```typescript
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useAddRecurringRule } from '../../src/hooks/useRecurringRules';
import { RecurringRuleForm } from '../../src/components/RecurringRuleForm';

export default function NewRecurringRuleScreen() {
  const router = useRouter();
  const { data: categories } = useCategories();
  const { mutate: addRecurringRule } = useAddRecurringRule();

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <RecurringRuleForm
      categories={categories}
      submitLabel="Add Recurring Rule"
      onSubmit={(values) => addRecurringRule(values, { onSuccess: () => router.back() })}
    />
  );
}
```

Create `app/recurring/[id].tsx`:

```typescript
import { View, ActivityIndicator, Pressable, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useUpdateRecurringRule, useSetRecurringRuleActive } from '../../src/hooks/useRecurringRules';
import { RecurringRuleForm } from '../../src/components/RecurringRuleForm';
import type { RecurringFrequency } from '../../src/types/database';

export default function EditRecurringRuleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    categoryId: string;
    amount: string;
    note: string;
    frequency: RecurringFrequency;
    active: string;
  }>();
  const { data: categories } = useCategories();
  const { mutate: updateRecurringRule } = useUpdateRecurringRule();
  const { mutate: setActive } = useSetRecurringRuleActive();

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const isActive = params.active === 'true';

  return (
    <View style={{ flex: 1 }}>
      <RecurringRuleForm
        categories={categories}
        initialValues={{
          categoryId: params.categoryId,
          amount: params.amount,
          note: params.note,
          frequency: params.frequency,
        }}
        submitLabel="Save Changes"
        onSubmit={(values) => updateRecurringRule({ id: params.id, ...values }, { onSuccess: () => router.back() })}
      />
      <Pressable
        style={styles.toggleButton}
        onPress={() => setActive({ id: params.id, active: !isActive }, { onSuccess: () => router.back() })}
      >
        <Text style={styles.toggleText}>{isActive ? 'Pause Rule' : 'Resume Rule'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggleButton: { padding: 16, alignItems: 'center' },
  toggleText: { color: '#D32F2F', fontWeight: '600' },
});
```

- [ ] **Step 4: Add the Recurring Rules section to Settings**

Modify `app/(tabs)/settings.tsx` to match:

```typescript
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useRecurringRules } from '../../src/hooks/useRecurringRules';
import { supabase } from '../../src/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const { data: categories } = useCategories();
  const { data: recurringRules } = useRecurringRules();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.heading}>Categories</Text>
      {(categories ?? []).map((category) => (
        <Pressable
          key={category.id}
          style={styles.row}
          onPress={() =>
            router.push({
              pathname: '/category/[id]',
              params: { id: category.id, name: category.name, color: category.color },
            })
          }
        >
          <View style={[styles.swatch, { backgroundColor: category.color }]} />
          <Text style={styles.rowText}>{category.name}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.addButton} onPress={() => router.push('/category/new')}>
        <Text style={styles.addButtonText}>+ Add Category</Text>
      </Pressable>

      <Text style={styles.heading}>Recurring Rules</Text>
      {(recurringRules ?? []).map((rule) => {
        const category = (categories ?? []).find((c) => c.id === rule.category_id);
        return (
          <Pressable
            key={rule.id}
            style={styles.row}
            onPress={() =>
              router.push({
                pathname: '/recurring/[id]',
                params: {
                  id: rule.id,
                  categoryId: rule.category_id,
                  amount: String(rule.amount),
                  note: rule.note ?? '',
                  frequency: rule.frequency,
                  active: String(rule.active),
                },
              })
            }
          >
            <Text style={styles.rowText}>
              {category?.name ?? 'Unknown'} — ${rule.amount.toFixed(2)} / {rule.frequency}
              {rule.active ? '' : ' (paused)'}
            </Text>
          </Pressable>
        );
      })}
      <Pressable style={styles.addButton} onPress={() => router.push('/recurring/new')}>
        <Text style={styles.addButtonText}>+ Add Recurring Rule</Text>
      </Pressable>

      <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  swatch: { width: 20, height: 20, borderRadius: 10, marginRight: 12 },
  rowText: { fontSize: 16 },
  addButton: { paddingVertical: 12 },
  addButtonText: { color: '#2196F3', fontWeight: '600' },
  signOutButton: { marginTop: 32, padding: 14, alignItems: 'center' },
  signOutText: { color: '#D32F2F', fontWeight: '600' },
});
```

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add recurring rule management (create/edit/pause) to settings"
```

---

### Task 27: Budget alert notifications

**Files:**
- Create: `src/hooks/useBudgetAlerts.ts`
- Modify: `app/(tabs)/_layout.tsx`
- Modify: `app.json`

**Interfaces:**
- Consumes: `useCategories` (Task 15), `useBudgets`/`useTransactions` (Tasks 16-17), `sumTransactionsForCategory`/`didCrossThreshold` (Tasks 10-11), `useUiStore` (Task 15).
- Produces: `useBudgetAlerts(month: string): void` — fires a local notification the first time a category's spend crosses 80% or 100% of its budget during the current app session. Called once from the tabs layout so it's active across the whole authenticated app.

- [ ] **Step 1: Ensure the Expo notifications plugin is registered**

Open `app.json` and make sure the `expo.plugins` array includes `"expo-notifications"` alongside whatever `create-expo-app` already put there (typically `"expo-router"`), e.g.:

```json
{
  "expo": {
    "plugins": ["expo-router", "expo-notifications"]
  }
}
```

- [ ] **Step 2: Write the budget alerts hook**

Create `src/hooks/useBudgetAlerts.ts`:

```typescript
import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { useCategories } from './useCategories';
import { useBudgets } from './useBudgets';
import { useTransactions } from './useTransactions';
import { sumTransactionsForCategory, didCrossThreshold } from '../domain/budgetMath';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export function useBudgetAlerts(month: string): void {
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(month);
  const { data: transactions } = useTransactions(month);
  const previousSpentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    Notifications.requestPermissionsAsync();
  }, []);

  useEffect(() => {
    if (!categories || !budgets || !transactions) return;

    for (const category of categories) {
      const budget = budgets.find((b) => b.category_id === category.id);
      const budgeted = budget?.amount ?? 0;
      const spent = sumTransactionsForCategory(transactions, category.id);
      const previousSpent = previousSpentRef.current.get(category.id) ?? 0;

      const crossing = didCrossThreshold(budgeted, previousSpent, spent);
      if (crossing.crossed) {
        const message =
          crossing.threshold === 100
            ? `${category.name} is over budget`
            : `${category.name} is nearing its budget`;

        Notifications.scheduleNotificationAsync({
          content: { title: 'Budget Alert', body: message },
          trigger: null,
        });
      }

      previousSpentRef.current.set(category.id, spent);
    }
  }, [categories, budgets, transactions]);
}
```

- [ ] **Step 3: Wire it into the tabs layout**

Modify `app/(tabs)/_layout.tsx`:

```typescript
import { Tabs } from 'expo-router';
import { useRecurringCatchUp } from '../../src/hooks/useRecurringRules';
import { useBudgetAlerts } from '../../src/hooks/useBudgetAlerts';
import { useUiStore } from '../../src/stores/useUiStore';

export default function TabsLayout() {
  useRecurringCatchUp();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  useBudgetAlerts(selectedMonth);

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: 'Overview' }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions' }} />
      <Tabs.Screen name="reports" options={{ title: 'Reports' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 5: Manually verify on a device or simulator**

Local notifications require a development build or a physical device/simulator (behavior in Expo Go can be limited depending on SDK version — if `scheduleNotificationAsync` silently no-ops in Expo Go, run `npx expo run:ios` or `npx expo run:android` instead). With the app running and signed in: set a category's budget to $100, add a transaction of $85 in that category (crosses 80%), and confirm a "Budget Alert" notification appears. Add another transaction of $20 (crosses 100%) and confirm a second notification appears reading "... is over budget".

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add local push notifications for budget threshold alerts"
```

---

### Task 28: Setup documentation and full verification pass

**Files:**
- Create: `README.md`

**Interfaces:**
- Produces: setup instructions for a new engineer (or the user) to get the app running from a fresh clone. No code interfaces — this is the plan's closing task.

- [ ] **Step 1: Write the README**

Create `README.md`:

```markdown
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

3. Link the project and push the database schema:

   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

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
```

- [ ] **Step 2: Run the full test suite**

```bash
npx jest
```

Expected: all tests pass (from Tasks 10, 11, 12, 20, and 21 — 5 + 6 + 5 + 2 + 3 = 21 tests total).

- [ ] **Step 3: Run a full type check**

```bash
npx tsc --noEmit
```

Expected: no type errors anywhere in the project.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: add project README with setup instructions"
```

---
