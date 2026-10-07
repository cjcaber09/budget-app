create table budget_tracker.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check(char_length(display_name)<=100),
  avatar_path text check(avatar_path is null or (avatar_path like user_id::text || '/%' and avatar_path !~ '\.\.')),
  appearance text not null default 'system' check(appearance in ('system','light','dark')),
  currency text not null default 'USD' check(currency in ('USD','PHP','EUR','GBP','SGD','AUD','CAD','NZD','MYR','HKD')),
  timezone text not null,
  updated_at timestamptz not null default now()
);
create function budget_tracker.validate_profile() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone' using errcode='22023'; end if;
 new.updated_at:=now(); return new;
end $$;
create trigger validate_profile before insert or update on budget_tracker.profiles for each row execute function budget_tracker.validate_profile();
alter table budget_tracker.profiles enable row level security;
revoke all on budget_tracker.profiles from public,anon,authenticated;
grant select,insert,update on budget_tracker.profiles to authenticated;
create policy profiles_owner on budget_tracker.profiles for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

create table budget_tracker.monthly_limits (
 user_id uuid not null references auth.users(id) on delete cascade,
 month date not null check(isfinite(month) and month= date_trunc('month',month)::date and month between date '0001-01-01' and date '9999-12-01'),
 amount numeric(12,2) not null check(amount>=0 and amount<=9999999999.99),
 inherited_from date,
 primary key(user_id,month)
);
alter table budget_tracker.monthly_limits enable row level security;
revoke all on budget_tracker.monthly_limits from public,anon,authenticated;
grant select,insert,update on budget_tracker.monthly_limits to authenticated;
create policy monthly_limits_owner on budget_tracker.monthly_limits for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
insert into budget_tracker.monthly_limits(user_id,month,amount)
 select user_id,month,sum(amount) from budget_tracker.budgets group by user_id,month;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('budget-tracker-avatars','budget-tracker-avatars',false,2097152,array['image/jpeg']) on conflict(id) do nothing;
create policy avatars_select on storage.objects for select to authenticated using(bucket_id='budget-tracker-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_insert on storage.objects for insert to authenticated with check(bucket_id='budget-tracker-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy avatars_delete on storage.objects for delete to authenticated using(bucket_id='budget-tracker-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
revoke all on function budget_tracker.validate_profile() from public,anon;
do $$begin
 if exists(select from pg_catalog.pg_publication where pubname='supabase_realtime') and not exists(select from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='budget_tracker' and tablename='profiles') then
  alter publication supabase_realtime add table budget_tracker.profiles;
 end if;
end $$;
notify pgrst,'reload schema';
