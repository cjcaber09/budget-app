alter table budget_tracker.transactions
  add column type text not null default 'expense' check (type in ('expense', 'income'));

-- Income transactions have no category (income isn't budgeted per-category).
-- The composite FK (user_id, category_id) -> categories(user_id, id) is
-- unaffected: Postgres skips FK checks when any column in the pair is null.
alter table budget_tracker.transactions
  alter column category_id drop not null;
