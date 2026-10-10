insert into auth.users(id) values('00000000-0000-4000-8000-000000009801'),('00000000-0000-4000-8000-000000009802');
insert into budget_tracker.profiles(user_id,timezone,currency)values('00000000-0000-4000-8000-000000009801','Asia/Manila','PHP'),('00000000-0000-4000-8000-000000009802','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009801';
set local request.jwt.claim.role='authenticated';
set local role authenticated;
do $cases$
declare m date:=date_trunc('month',now() at time zone 'Asia/Manila')::date;c uuid;snapshot jsonb;history jsonb;
begin
 select id into c from budget_tracker.categories where user_id=auth.uid() limit 1;
 insert into budget_tracker.transactions(id,user_id,type,category_id,amount,note,occurred_at,transaction_date)
 select gen_random_uuid(),auth.uid(),'expense',c,1.01,'Synthetic comma, "quote"',m::timestamptz,m from generate_series(1,1001);
 insert into budget_tracker.transactions(id,user_id,type,amount,note,occurred_at,transaction_date)values(gen_random_uuid(),auth.uid(),'expense',2,'Synthetic Uncategorized',m::timestamptz,m);
 snapshot:=budget_tracker.report_export_snapshot((m-interval '11 months')::date,m);
 if snapshot->>'owner'<>auth.uid()::text or snapshot->>'currency'<>'PHP' or snapshot->>'timezone'<>'Asia/Manila' then raise exception 'Export context failed';end if;
 if (select count(*) from jsonb_array_elements(snapshot->'rows')r where r->>'row_type'='monthly')<>12 then raise exception 'Zero month filling failed';end if;
 if (select r->>'spending' from jsonb_array_elements(snapshot->'rows')r where r->>'row_type'='monthly' and r->>'month'=m::text)<>'101301' then raise exception 'Exact complete aggregate failed';end if;
 if (select sum((r->>'spending')::numeric) from jsonb_array_elements(snapshot->'rows')r where r->>'row_type'='account' and r->>'month'=m::text)<>101301 then raise exception 'Account reconciliation failed';end if;
 if (select sum((r->>'expense_count')::integer) from jsonb_array_elements(snapshot->'rows')r where r->>'row_type'='category' and r->>'month'=m::text)<>1002 then raise exception 'Category counts failed';end if;
 history:=budget_tracker.transaction_export_snapshot(m);
 if jsonb_array_length(history->'rows')<>1002 then raise exception 'Transaction export truncated';end if;
 if not exists(select from jsonb_array_elements(history->'rows')r where r->>'amount'='101' and r->>'category' is not null and r->>'payment_account'='Cash')then raise exception 'Joined export failed';end if;
 begin perform budget_tracker.report_export_snapshot(m,(m+interval '1 month')::date);raise exception 'Invalid range accepted';exception when invalid_parameter_value then null;end;
 begin perform budget_tracker.begin_account_deletion(auth.uid(),gen_random_uuid());raise exception 'Client deletion initiation accepted';exception when insufficient_privilege then null;end;
 begin perform 1 from budget_tracker.account_deletions;raise exception 'Client status table readable';exception when insufficient_privilege then null;end;
end $cases$;
reset role;
set local request.jwt.claim.role='service_role';
select budget_tracker.begin_account_deletion('00000000-0000-4000-8000-000000009801','00000000-0000-4000-8000-000000009803');
select budget_tracker.begin_account_deletion('00000000-0000-4000-8000-000000009801','00000000-0000-4000-8000-000000009804');
do $$begin
 if(select count(*) from budget_tracker.account_deletions where owner_id='00000000-0000-4000-8000-000000009801')<>1 then raise exception 'Duplicate deletion operation';end if;
 if budget_tracker.begin_account_scan('00000000-0000-4000-8000-000000009801',gen_random_uuid())then raise exception 'Scan admitted during deletion';end if;
end $$;
set local request.jwt.claim.role='authenticated';
set local role authenticated;
do $$begin
 if budget_tracker.account_is_active()then raise exception 'Deleting account active';end if;
 begin update budget_tracker.profiles set display_name='Blocked' where user_id=auth.uid();raise exception 'Write during deletion accepted';exception when insufficient_privilege then null;end;
 begin insert into storage.objects(bucket_id,name)values('budget-tracker-avatars',auth.uid()::text||'/synthetic.jpg');raise exception 'Avatar during deletion accepted';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009802';
do $$begin if not budget_tracker.account_is_active()then raise exception 'Other owner blocked';end if;perform budget_tracker.transaction_export_snapshot(date_trunc('month',now() at time zone 'UTC')::date);end $$;
reset role;
set local request.jwt.claim.sub='';
delete from auth.users where id='00000000-0000-4000-8000-000000009801';
do $$begin if not exists(select from budget_tracker.account_deletions where request_id='00000000-0000-4000-8000-000000009803')then raise exception 'Retry record cascaded';end if;end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000009801';
set local role authenticated;
do $$begin
 if budget_tracker.account_is_active()then raise exception 'Deleted JWT active';end if;
 begin insert into storage.objects(bucket_id,name)values('budget-tracker-avatars',auth.uid()::text||'/synthetic-after.jpg');raise exception 'Deleted token avatar accepted';exception when insufficient_privilege then null;end;
end $$;
