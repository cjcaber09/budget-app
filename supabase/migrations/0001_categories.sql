create schema if not exists budget_tracker;

grant usage on schema budget_tracker to anon, authenticated, service_role;

alter default privileges in schema budget_tracker
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema budget_tracker
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema budget_tracker
  grant all on functions to anon, authenticated, service_role;

create table if not exists budget_tracker.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null,
  icon text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

alter table budget_tracker.categories enable row level security;

create policy "categories_select_own" on budget_tracker.categories
  for select using (auth.uid() = user_id);

create policy "categories_insert_own" on budget_tracker.categories
  for insert with check (auth.uid() = user_id);

create policy "categories_update_own" on budget_tracker.categories
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "categories_delete_own" on budget_tracker.categories
  for delete using (auth.uid() = user_id);
