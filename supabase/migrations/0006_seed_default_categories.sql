create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public, budget_tracker
as $$
begin
  insert into budget_tracker.categories (user_id, name, color, icon, is_default) values
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
