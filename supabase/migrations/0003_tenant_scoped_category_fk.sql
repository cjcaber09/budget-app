-- A plain `category_id references categories(id)` foreign key only checks that
-- the referenced category exists somewhere -- not that it belongs to the same
-- user as the referencing row. That lets a user's budget point at another
-- user's category id. RLS still hides other users' budget rows from each
-- other, but the cross-tenant reference itself is a real integrity gap.
-- Fix: make the FK composite on (user_id, category_id), which Postgres can
-- only satisfy if both columns match the same category row.

alter table budget_tracker.categories
  add constraint categories_user_id_id_key unique (user_id, id);

alter table budget_tracker.budgets
  drop constraint budgets_category_id_fkey;

alter table budget_tracker.budgets
  add constraint budgets_category_id_fkey
  foreign key (user_id, category_id) references budget_tracker.categories(user_id, id)
  on delete cascade;
