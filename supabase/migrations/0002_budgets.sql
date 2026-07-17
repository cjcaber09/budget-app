create table if not exists budget_tracker.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references budget_tracker.categories(id) on delete cascade,
  month date not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

alter table budget_tracker.budgets enable row level security;

create policy "budgets_select_own" on budget_tracker.budgets
  for select using (auth.uid() = user_id);

create policy "budgets_insert_own" on budget_tracker.budgets
  for insert with check (auth.uid() = user_id);

create policy "budgets_update_own" on budget_tracker.budgets
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budgets_delete_own" on budget_tracker.budgets
  for delete using (auth.uid() = user_id);
