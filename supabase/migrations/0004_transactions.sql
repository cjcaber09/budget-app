create table if not exists budget_tracker.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  occurred_at timestamptz not null default now(),
  recurring_rule_id uuid,
  created_at timestamptz not null default now(),
  foreign key (user_id, category_id) references budget_tracker.categories(user_id, id) on delete cascade
);

alter table budget_tracker.transactions enable row level security;

create policy "transactions_select_own" on budget_tracker.transactions
  for select using (auth.uid() = user_id);

create policy "transactions_insert_own" on budget_tracker.transactions
  for insert with check (auth.uid() = user_id);

create policy "transactions_update_own" on budget_tracker.transactions
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transactions_delete_own" on budget_tracker.transactions
  for delete using (auth.uid() = user_id);

create index if not exists transactions_user_month_idx
  on budget_tracker.transactions (user_id, occurred_at);
