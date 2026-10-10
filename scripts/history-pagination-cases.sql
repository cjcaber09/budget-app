insert into auth.users(id) values('00000000-0000-4000-8000-000000009911'),('00000000-0000-4000-8000-000000009912');
insert into budget_tracker.profiles(user_id,timezone,currency) values
 ('00000000-0000-4000-8000-000000009911','Asia/Manila','PHP'),('00000000-0000-4000-8000-000000009912','UTC','USD');
insert into budget_tracker.categories(id,user_id,name,color,icon,is_default) values
 ('00000000-0000-4000-8000-000000009913','00000000-0000-4000-8000-000000009911','Paging category','#55816A','tag',false);
insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date)
 select gen_random_uuid(),'00000000-0000-4000-8000-000000009911',case when g<=22 then 'expense' else 'income' end,
 '00000000-0000-4000-8000-000000009913',1000.50,'Page '||g,
 (date_trunc('month',now() at time zone 'Asia/Manila')+interval '12 hours') at time zone 'Asia/Manila',
 date_trunc('month',now() at time zone 'Asia/Manila')::date from generate_series(1,25)g;
insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date) values
 (gen_random_uuid(),'00000000-0000-4000-8000-000000009911','expense','00000000-0000-4000-8000-000000009913',2,'Legacy boundary',date_trunc('month',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila',null),
 (gen_random_uuid(),'00000000-0000-4000-8000-000000009911','expense','00000000-0000-4000-8000-000000009913',2,'Outside boundary',(date_trunc('month',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila')-interval '1 second',null),
 (gen_random_uuid(),'00000000-0000-4000-8000-000000009912','expense',null,3,'Foreign owner',now(),date_trunc('month',now())::date);
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009911';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
do $cases$
declare m date:=date_trunc('month',now() at time zone 'Asia/Manila')::date; page jsonb; cursor jsonb;
 ids jsonb:='[]'; exported jsonb; before_ids jsonb; iterations integer:=0;
begin
 loop
  page:=budget_tracker.transaction_history_page(m,'all','',(cursor->>'date')::date,(cursor->>'at')::timestamptz,(cursor->>'id')::uuid);
  if page->>'owner'<>auth.uid()::text or page->>'timezone'<>'Asia/Manila' or jsonb_array_length(page->'rows')>10 then raise exception 'History scope or page size';end if;
  if exists(select from jsonb_array_elements(page->'rows')r where jsonb_typeof(r->'amount')<>'string' or r->>'user_id'<>auth.uid()::text)then raise exception 'History money/owner transport';end if;
  select ids||coalesce(jsonb_agg(r->>'id'),'[]') into ids from jsonb_array_elements(page->'rows')r;
  iterations:=iterations+1;if iterations>4 then raise exception 'History cursor loop';end if;
  exit when not (page->>'has_more')::boolean;
  cursor:=page->'next';
 end loop;
 if jsonb_array_length(ids)<>26 or (select count(distinct value) from jsonb_array_elements_text(ids))<>26 or iterations<>3 then raise exception 'History lost/duplicate rows';end if;
 exported:=budget_tracker.transaction_export_snapshot(m);
 select jsonb_agg(r->>'transaction_id') into before_ids from jsonb_array_elements(exported->'rows')r;
 if ids<>before_ids then raise exception 'History and export ordering diverge';end if;
 page:=budget_tracker.transaction_history_page(m,'income');if jsonb_array_length(page->'rows')<>3 or (page->>'has_more')::boolean then raise exception 'Income filtering';end if;
 page:=budget_tracker.transaction_history_page(m,'expense','page 25');if jsonb_array_length(page->'rows')<>0 then raise exception 'Type filtering applied after pagination';end if;
 page:=budget_tracker.transaction_history_page(m,'all','1000.5');if jsonb_array_length(page->'rows')<>10 or not (page->>'has_more')::boolean then raise exception 'Amount search normalization';end if;
 page:=budget_tracker.transaction_history_page(m,'all','outside boundary');if jsonb_array_length(page->'rows')<>0 then raise exception 'Legacy timezone month boundary';end if;
 page:=budget_tracker.transaction_history_page(m,'all','paging category');if jsonb_array_length(page->'rows')<>10 then raise exception 'Category search';end if;
 page:=budget_tracker.transaction_history_page(m,'all','%');if jsonb_array_length(page->'rows')<>0 then raise exception 'Search interpreted wildcard';end if;
 begin perform budget_tracker.transaction_history_page(m,'bad');raise exception 'Invalid type accepted';exception when invalid_parameter_value then null;end;
 begin perform budget_tracker.transaction_history_page(m,'all','',m);raise exception 'Partial cursor accepted';exception when invalid_parameter_value then null;end;
end $cases$;
reset role;
do $$begin
 if has_function_privilege('anon','budget_tracker.transaction_history_page(date,text,text,date,timestamptz,uuid)','execute') then raise exception 'Anonymous history execution';end if;
end $$;
