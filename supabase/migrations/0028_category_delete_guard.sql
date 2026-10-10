-- Preserve financial history rather than allowing the legacy FK cascades.
create function budget_tracker.guard_category_delete() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Account cleanup must still be able to cascade through all owned records.
 if auth.uid() is null or not exists(select from auth.users where id=old.user_id) then return old; end if;
 if auth.uid()<>old.user_id then raise exception 'Category unavailable' using errcode='42501'; end if;
 perform budget_tracker.financial_lock();
 if exists(select from budget_tracker.transactions where user_id=old.user_id and category_id=old.id)
 or exists(select from budget_tracker.recurring_rules where user_id=old.user_id and category_id=old.id)
 or exists(select from budget_tracker.recurring_occurrences where user_id=old.user_id and category_id=old.id) then
  raise exception 'Reassign this category''s transactions and bills before deleting it.' using errcode='BC001';
 end if;
 return old;
end $$;
revoke all on function budget_tracker.guard_category_delete() from public,anon,authenticated;
create trigger categories_delete_guard before delete on budget_tracker.categories
 for each row execute function budget_tracker.guard_category_delete();
