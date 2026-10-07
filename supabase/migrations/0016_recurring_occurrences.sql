alter table budget_tracker.recurring_rules add column anchor_day integer check(anchor_day between 1 and 31), add column month_end boolean not null default false, add column archived boolean not null default false, add column paused_at date;
update budget_tracker.recurring_rules set anchor_day=extract(day from next_occurrence_date)::integer;
alter table budget_tracker.recurring_rules alter column anchor_day set not null;
alter table budget_tracker.recurring_rules add column preview_through date;
alter table budget_tracker.transactions add column spending_source text not null default 'manual' check(spending_source in ('manual','recurring'));
create table budget_tracker.recurring_occurrences (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 rule_id uuid not null, scheduled_date date not null check(isfinite(scheduled_date)),
 amount numeric(12,2) not null check(amount>0 and amount<=9999999999.99), category_id uuid, label text,
 state text not null default 'outstanding' check(state in ('outstanding','replacement','recorded','skipped')), skip_reason text check(skip_reason in ('user','pause','archive')),
 transaction_id uuid unique,
 unique(user_id,id), unique(user_id,rule_id,scheduled_date),
 foreign key(user_id,rule_id) references budget_tracker.recurring_rules(user_id,id) on delete cascade,
 foreign key(user_id,transaction_id) references budget_tracker.transactions(user_id,id) deferrable initially deferred,
 check((state='recorded')=(transaction_id is not null))
);
alter table budget_tracker.transactions add column occurrence_id uuid,
 add constraint transactions_occurrence_owner foreign key(user_id,occurrence_id) references budget_tracker.recurring_occurrences(user_id,id) on delete set null(occurrence_id);
create unique index transactions_one_occurrence on budget_tracker.transactions(occurrence_id) where occurrence_id is not null;
alter table budget_tracker.recurring_occurrences enable row level security;
revoke all on budget_tracker.recurring_occurrences from public,anon,authenticated;
grant select on budget_tracker.recurring_occurrences to authenticated;
create policy occurrence_owner on budget_tracker.recurring_occurrences for select to authenticated using(user_id=auth.uid());
-- All schedule writes go through owner-checked RPCs. Legacy catch-up cannot
-- continue advancing schedules independently of the occurrence ledger.
revoke insert,update,delete on budget_tracker.recurring_rules from anon,authenticated;

create function budget_tracker.next_rule_date(d date,frequency text,anchor integer,eom boolean) returns date language sql immutable set search_path='' as $$
 select case when frequency='weekly' then d+7 else
 (date_trunc('month',d)+interval '1 month')::date +
 (case when eom then extract(day from date_trunc('month',d)+interval '2 months - 1 day')::integer
 else least(anchor,extract(day from date_trunc('month',d)+interval '2 months - 1 day')::integer) end -1) end
$$;
create function budget_tracker.financial_lock() returns void language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,371));
end $$;
create function budget_tracker.recurring_write_guard() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if current_user in ('anon','authenticated') then
  if tg_op='INSERT' then
   if new.recurring_rule_id is not null or new.occurrence_id is not null or new.spending_source<>'manual' then raise exception 'Update the app to record recurring expenses' using errcode='42501'; end if;
  elsif old.occurrence_id is not null or (tg_op='UPDATE' and (new.occurrence_id is distinct from old.occurrence_id or new.recurring_rule_id is distinct from old.recurring_rule_id or new.spending_source is distinct from old.spending_source)) then
   raise exception 'Use the bill command to change a linked expense' using errcode='42501';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger recurring_write_guard before insert or update or delete on budget_tracker.transactions for each row execute function budget_tracker.recurring_write_guard();

create function budget_tracker.check_occurrence(p_id uuid) returns void language plpgsql set search_path='' as $$
declare o budget_tracker.recurring_occurrences;
begin
 select * into o from budget_tracker.recurring_occurrences where id=p_id;
 if not found then return; end if;
 if o.state='recorded' and not exists(select from budget_tracker.transactions where id=o.transaction_id and user_id=o.user_id and type='expense' and occurrence_id=o.id) then raise exception 'Bill must link to its owned expense' using errcode='23514'; end if;
 if exists(select from budget_tracker.transactions where occurrence_id=o.id and (id is distinct from o.transaction_id or user_id<>o.user_id)) then raise exception 'Inconsistent bill association' using errcode='23514'; end if;
end $$;
create function budget_tracker.enforce_occurrence() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='recurring_occurrences' then
  if tg_op<>'DELETE' then perform budget_tracker.check_occurrence(new.id); end if;
 else
  if tg_op<>'INSERT' then perform budget_tracker.check_occurrence(old.occurrence_id); end if;
  if tg_op<>'DELETE' then perform budget_tracker.check_occurrence(new.occurrence_id); end if;
 end if;
 return null;
end $$;
create constraint trigger occurrence_consistency after insert or update or delete on budget_tracker.recurring_occurrences deferrable initially deferred for each row execute function budget_tracker.enforce_occurrence();
create constraint trigger expense_occurrence_consistency after insert or update or delete on budget_tracker.transactions deferrable initially deferred for each row execute function budget_tracker.enforce_occurrence();

create function budget_tracker.generate_occurrences(p_rule uuid,p_through date) returns void language plpgsql security definer set search_path='' as $$
declare r budget_tracker.recurring_rules; d date; n integer:=0;
begin
 select * into r from budget_tracker.recurring_rules where id=p_rule and user_id=auth.uid() for update;
 if not found or not r.active or r.archived then return; end if;
 d:=r.next_occurrence_date;
 while d<=p_through loop
  n:=n+1; if n>10000 then raise exception 'Recurring schedule is too old; update its next due date' using errcode='22023'; end if;
  insert into budget_tracker.recurring_occurrences(user_id,rule_id,scheduled_date,amount,category_id,label)
   values(r.user_id,r.id,d,r.amount,r.category_id,r.note) on conflict(user_id,rule_id,scheduled_date) do nothing;
  d:=budget_tracker.next_rule_date(d,r.frequency,r.anchor_day,r.month_end);
 end loop;
 update budget_tracker.recurring_rules set preview_through=greatest(coalesce(preview_through,p_through),p_through) where id=r.id;
end $$;

create function budget_tracker.save_recurring_rule(p_rule jsonb) returns budget_tracker.recurring_rules language plpgsql security definer set search_path='' as $$
declare r budget_tracker.recurring_rules; day date; v_rule_id uuid; next_day date; today date; command text; zone text;
begin
 perform budget_tracker.financial_lock();
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 if zone is null then raise exception 'Set your timezone first' using errcode='22023'; end if;
 today:=(now() at time zone zone)::date;
 command:=coalesce(p_rule->>'command','save'); v_rule_id:=(p_rule->>'id')::uuid;
 if v_rule_id is not null then select * into r from budget_tracker.recurring_rules where user_id=auth.uid() and recurring_rules.id=v_rule_id for update;
  if not found then raise exception 'Rule unavailable' using errcode='42501'; end if;
 end if;
 if command in ('pause','resume','archive') then
  if v_rule_id is null then raise exception 'Rule required' using errcode='22023'; end if;
  if command='pause' then
   update budget_tracker.recurring_rules set active=false,paused_at=today where recurring_rules.id=v_rule_id returning * into r;
   update budget_tracker.recurring_occurrences set state='skipped',skip_reason='pause' where rule_id=v_rule_id and state in ('outstanding','replacement') and scheduled_date>=today;
  elsif command='archive' then
   update budget_tracker.recurring_rules set active=false,archived=true where recurring_rules.id=v_rule_id returning * into r;
   update budget_tracker.recurring_occurrences set state='skipped',skip_reason='archive' where rule_id=v_rule_id and state in ('outstanding','replacement');
  else
   if r.archived then raise exception 'Archived rule cannot resume' using errcode='22023'; end if;
   next_day:=r.next_occurrence_date;
   while next_day<today loop next_day:=budget_tracker.next_rule_date(next_day,r.frequency,r.anchor_day,r.month_end); end loop;
   update budget_tracker.recurring_occurrences set state='skipped',skip_reason='pause' where rule_id=v_rule_id and state in ('outstanding','replacement') and scheduled_date>=coalesce(r.paused_at,today);
   -- Previously previewed future skipped dates become payable again on resume.
   delete from budget_tracker.recurring_occurrences where rule_id=v_rule_id and state='skipped' and skip_reason='pause' and scheduled_date>=next_day;
   update budget_tracker.recurring_rules set active=true,paused_at=null,next_occurrence_date=next_day where recurring_rules.id=v_rule_id returning * into r;
  end if;
  if command='resume' then perform budget_tracker.generate_occurrences(r.id,greatest(coalesce(r.preview_through,today),(date_trunc('month',today)+interval '1 month - 1 day')::date)); end if;
  return r;
 end if;
 if command<>'save' or p_rule->>'frequency' not in ('weekly','monthly') or p_rule->>'frequency' is null then raise exception 'Invalid rule' using errcode='22023'; end if;
 day:=(p_rule->>'nextDueDate')::date;
 if day is null or not isfinite(day) or coalesce(p_rule->>'amount','') !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' or (p_rule->>'amount')::numeric<=0 then raise exception 'Invalid due date or amount' using errcode='22023'; end if;
 if not exists(select from budget_tracker.categories where user_id=auth.uid() and categories.id=(p_rule->>'categoryId')::uuid) then raise exception 'Category unavailable' using errcode='42501'; end if;
 if v_rule_id is null then
  insert into budget_tracker.recurring_rules(user_id,category_id,amount,note,frequency,next_occurrence_date,anchor_day,month_end)
  values(auth.uid(),(p_rule->>'categoryId')::uuid,(p_rule->>'amount')::numeric,p_rule->>'note',p_rule->>'frequency',day,extract(day from day)::integer,coalesce((p_rule->>'monthEnd')::boolean,false)) returning * into r;
 else
  delete from budget_tracker.recurring_occurrences where rule_id=v_rule_id and state='outstanding' and scheduled_date>=today;
  update budget_tracker.recurring_rules set category_id=(p_rule->>'categoryId')::uuid,amount=(p_rule->>'amount')::numeric,note=p_rule->>'note',frequency=p_rule->>'frequency',next_occurrence_date=day,
  anchor_day=case when day=r.next_occurrence_date then r.anchor_day else extract(day from day)::integer end,month_end=coalesce((p_rule->>'monthEnd')::boolean,false)
  where recurring_rules.id=v_rule_id returning * into r;
 end if;
 perform budget_tracker.generate_occurrences(r.id,greatest(coalesce(r.preview_through,today),(date_trunc('month',today)+interval '1 month - 1 day')::date));
 return r;
end $$;

create function budget_tracker.prepare_dashboard(p_month date) returns void language plpgsql security definer set search_path='' as $$
declare zone text; today date; current_month date; through date; r record; o budget_tracker.recurring_occurrences; tx_id uuid; cursor date; prior budget_tracker.monthly_limits;
begin
 perform budget_tracker.financial_lock();
 select timezone into zone from budget_tracker.profiles where user_id=auth.uid();
 if zone is null then raise exception 'Set your timezone first' using errcode='22023'; end if;
 today:=(now() at time zone zone)::date; current_month:=date_trunc('month',today)::date;
 if not isfinite(p_month) or p_month<>date_trunc('month',p_month)::date or p_month>current_month+interval '2 years' then raise exception 'Choose a month within the next two years' using errcode='22023'; end if;
 if p_month=current_month and not exists(select from budget_tracker.monthly_limits where user_id=auth.uid() and month=p_month) then
  select * into prior from budget_tracker.monthly_limits where user_id=auth.uid() and month<p_month order by month desc limit 1;
  if found then insert into budget_tracker.monthly_limits(user_id,month,amount,inherited_from) values(auth.uid(),p_month,prior.amount,prior.month) on conflict do nothing; end if;
 end if;
 through:=greatest(today,(p_month+interval '1 month - 1 day')::date);
 for r in select id from budget_tracker.recurring_rules where user_id=auth.uid() and active and not archived order by id loop
  perform budget_tracker.generate_occurrences(r.id,through);
 end loop;
 for o in select x.* from budget_tracker.recurring_occurrences x join budget_tracker.recurring_rules rr on rr.id=x.rule_id where x.user_id=auth.uid() and rr.active and not rr.archived and x.state='outstanding' and x.scheduled_date<=today order by x.rule_id,x.scheduled_date for update of x loop
  tx_id:=gen_random_uuid();
  insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date,recurring_rule_id,spending_source,occurrence_id)
   values(tx_id,auth.uid(),'expense',o.category_id,o.amount,o.label,(o.scheduled_date+time '12:00') at time zone zone,o.scheduled_date,o.rule_id,'recurring',o.id);
  update budget_tracker.recurring_occurrences set state='recorded',transaction_id=tx_id where id=o.id;
 end loop;
 for r in select * from budget_tracker.recurring_rules where user_id=auth.uid() and active and not archived order by id loop
  cursor:=r.next_occurrence_date;
  while cursor<=today loop cursor:=budget_tracker.next_rule_date(cursor,r.frequency,r.anchor_day,r.month_end); end loop;
  update budget_tracker.recurring_rules set next_occurrence_date=cursor where id=r.id;
 end loop;
end $$;

create function budget_tracker.bill_command(p_occurrence uuid,p_command text,p_transaction jsonb default null,p_items jsonb default '[]',p_confirm_difference boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare o budget_tracker.recurring_occurrences; t budget_tracker.transactions; previous_amount numeric; payload jsonb;
begin
 perform budget_tracker.financial_lock();
 select * into o from budget_tracker.recurring_occurrences where id=p_occurrence and user_id=auth.uid() for update;
 if not found then raise exception 'Bill unavailable' using errcode='42501'; end if;
 if p_command in ('skip','replace','convert_income') then
  if o.transaction_id is not null then
   if p_command='convert_income' then
    update budget_tracker.transactions set occurrence_id=null where id=o.transaction_id;
    payload:=p_transaction || jsonb_build_object('id',o.transaction_id,'operation','update','type','income','category_id',null);
    t:=budget_tracker.save_transaction(payload,p_items);
   else
    update budget_tracker.recurring_occurrences set transaction_id=null,state=case when p_command='replace' then 'replacement' else 'skipped' end,skip_reason=case when p_command='replace' then null else 'user' end where id=o.id;
    delete from budget_tracker.transactions where id=o.transaction_id;
   end if;
  end if;
  update budget_tracker.recurring_occurrences set transaction_id=null,state=case when p_command='replace' then 'replacement' else 'skipped' end,skip_reason=case when p_command='replace' then null else 'user' end where id=o.id;
  return jsonb_build_object('transaction',case when p_command='convert_income' then to_jsonb(t) else null end,'occurrence',(select to_jsonb(x) from budget_tracker.recurring_occurrences x where id=o.id));
 elsif p_command='link' then
  select * into t from budget_tracker.transactions where id=(p_transaction->>'id')::uuid and user_id=auth.uid() for update;
  if not found or t.type<>'expense' or (t.occurrence_id is not null and t.occurrence_id<>o.id) then raise exception 'Choose an unlinked expense' using errcode='22023'; end if;
  if o.state='recorded' and o.transaction_id<>t.id then raise exception 'Bill already recorded' using errcode='23505'; end if;
  if t.amount<>o.amount and not p_confirm_difference then raise exception 'Confirm that this expense settles the whole bill' using errcode='22023'; end if;
 elsif p_command in ('record','edit') then
  if p_command='record' and o.state='recorded' then
   if o.transaction_id<>(p_transaction->>'id')::uuid then raise exception 'Bill already recorded' using errcode='23505'; end if;
  end if;
  payload:=p_transaction || jsonb_build_object('type','expense');
  if p_command='edit' then
   if o.transaction_id is null then raise exception 'No linked expense' using errcode='22023'; end if;
   select amount into previous_amount from budget_tracker.transactions where id=o.transaction_id;
   payload:=payload || jsonb_build_object('id',o.transaction_id,'operation','update');
  end if;
  t:=budget_tracker.save_transaction(payload,p_items);
  if t.amount<>o.amount and not p_confirm_difference and (p_command='record' or t.amount is distinct from previous_amount) then raise exception 'Confirm that this expense settles the whole bill' using errcode='22023'; end if;
 else raise exception 'Invalid bill command' using errcode='22023'; end if;
 update budget_tracker.transactions set occurrence_id=o.id where id=t.id;
 update budget_tracker.recurring_occurrences set state='recorded',transaction_id=t.id,skip_reason=null where id=o.id;
 return jsonb_build_object('transaction',(select to_jsonb(x) from budget_tracker.transactions x where id=t.id),'occurrence',(select to_jsonb(x) from budget_tracker.recurring_occurrences x where id=o.id));
end $$;
update budget_tracker.transactions set spending_source='recurring' where recurring_rule_id is not null;
insert into budget_tracker.recurring_occurrences(user_id,rule_id,scheduled_date,amount,category_id,label,state,transaction_id)
 select distinct on(t.user_id,t.recurring_rule_id,coalesce(t.transaction_date,t.occurred_at::date)) t.user_id,t.recurring_rule_id,coalesce(t.transaction_date,t.occurred_at::date),t.amount,t.category_id,t.note,'recorded',t.id
 from budget_tracker.transactions t where t.recurring_rule_id is not null and t.type='expense'
 order by t.user_id,t.recurring_rule_id,coalesce(t.transaction_date,t.occurred_at::date),t.created_at,t.id;
update budget_tracker.transactions t set occurrence_id=o.id from budget_tracker.recurring_occurrences o where o.transaction_id=t.id;
-- Definer commands have explicit auth.uid ownership checks, fixed search paths,
-- and no caller-supplied user IDs. Internal helpers are not public RPCs.
revoke all on function budget_tracker.generate_occurrences(uuid,date),budget_tracker.next_rule_date(date,text,integer,boolean),budget_tracker.financial_lock(),budget_tracker.recurring_write_guard(),budget_tracker.check_occurrence(uuid),budget_tracker.enforce_occurrence() from public,anon,authenticated;
revoke all on function budget_tracker.save_recurring_rule(jsonb),budget_tracker.prepare_dashboard(date),budget_tracker.bill_command(uuid,text,jsonb,jsonb,boolean) from public,anon;
grant execute on function budget_tracker.save_recurring_rule(jsonb),budget_tracker.prepare_dashboard(date),budget_tracker.bill_command(uuid,text,jsonb,jsonb,boolean) to authenticated;
notify pgrst,'reload schema';
