create table if not exists budget_tracker.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null,
  amount numeric(12,2) not null check (amount > 0),
  note text,
  frequency text not null check (frequency in ('weekly', 'monthly')),
  next_occurrence_date date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  foreign key (user_id, category_id) references budget_tracker.categories(user_id, id) on delete cascade
);

alter table budget_tracker.recurring_rules enable row level security;

create policy "recurring_rules_select_own" on budget_tracker.recurring_rules
  for select using (auth.uid() = user_id);

create policy "recurring_rules_insert_own" on budget_tracker.recurring_rules
  for insert with check (auth.uid() = user_id);

create policy "recurring_rules_update_own" on budget_tracker.recurring_rules
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "recurring_rules_delete_own" on budget_tracker.recurring_rules
  for delete using (auth.uid() = user_id);

alter table budget_tracker.transactions
  add constraint transactions_recurring_rule_id_fkey
  foreign key (user_id, recurring_rule_id) references budget_tracker.recurring_rules(user_id, id) on delete set null;
