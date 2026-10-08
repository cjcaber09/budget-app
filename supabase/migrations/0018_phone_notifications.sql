alter table budget_tracker.profiles add column budget_notifications boolean not null default false, add column bill_notifications boolean not null default false, add column notification_private boolean not null default true;
alter table budget_tracker.recurring_rules add column reminder_enabled boolean not null default false, add column reminder_days_before integer not null default 1 check(reminder_days_before in (0,1,3)), add column reminder_time text not null default '09:00' check(reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

create or replace function budget_tracker.save_recurring_rule(p_rule jsonb) returns budget_tracker.recurring_rules language plpgsql security definer set search_path='' as $$
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
 if p_rule ? 'reminderEnabled' and jsonb_typeof(p_rule->'reminderEnabled') <> 'boolean' then raise exception 'Invalid reminder switch' using errcode='22023'; end if;
 update budget_tracker.recurring_rules set reminder_enabled=coalesce((p_rule->>'reminderEnabled')::boolean,reminder_enabled),reminder_days_before=coalesce((p_rule->>'reminderDaysBefore')::integer,reminder_days_before),reminder_time=coalesce(p_rule->>'reminderTime',reminder_time) where id=r.id returning * into r;
 perform budget_tracker.generate_occurrences(r.id,greatest(coalesce(r.preview_through,today),(date_trunc('month',today)+interval '1 month - 1 day')::date));
 return r;
end $$;


create function budget_tracker.phone_notification_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare p budget_tracker.profiles; v_rule budget_tracker.recurring_rules; today date; bills jsonb;
begin
 perform budget_tracker.financial_lock();
 select * into p from budget_tracker.profiles where user_id=auth.uid();
 if not found then raise exception 'Profile unavailable' using errcode='42501'; end if;
 today:=(now() at time zone p.timezone)::date;
 if p.bill_notifications then
  for v_rule in select * from budget_tracker.recurring_rules where user_id=auth.uid() and active and not archived and reminder_enabled order by id loop
   perform budget_tracker.generate_occurrences(v_rule.id,today+30);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into bills from (
   select o.id,o.rule_id,o.scheduled_date,o.amount,o.label,
    ((o.scheduled_date-r.reminder_days_before)+r.reminder_time::time) at time zone p.timezone as reminder_at
   from budget_tracker.recurring_occurrences o join budget_tracker.recurring_rules r on r.id=o.rule_id
   where o.user_id=auth.uid() and r.user_id=auth.uid() and r.active and not r.archived and r.reminder_enabled and o.state in ('outstanding','replacement')
    and o.scheduled_date between today and today+30 and ((o.scheduled_date-r.reminder_days_before)+r.reminder_time::time) at time zone p.timezone > now()
   order by reminder_at,o.id limit 48
  ) x;
 else bills:='[]'::jsonb;
 end if;
 return jsonb_build_object('owner',p.user_id,'timezone',p.timezone,'bills',bills);
end $$;
revoke all on function budget_tracker.phone_notification_snapshot() from public,anon;
grant execute on function budget_tracker.phone_notification_snapshot() to authenticated;
