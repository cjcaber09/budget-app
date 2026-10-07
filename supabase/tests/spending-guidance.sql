create function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
 begin execute statement;set constraints all immediate;
 exception when others then if sqlstate=expected then return;end if;raise exception 'Expected %, got %: %',expected,sqlstate,sqlerrm;end;
 raise exception 'Expected rejection %',expected;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
insert into budget_tracker.profiles(user_id,timezone,display_name) values(auth.uid(),'Asia/Manila','Synthetic profile');
select pg_temp.expect_error($q$update budget_tracker.profiles set timezone='Invalid/Zone' where user_id=auth.uid()$q$,'22023');
insert into budget_tracker.monthly_limits(user_id,month,amount) values(auth.uid(),date_trunc('month',now() at time zone 'Asia/Manila')::date-interval '1 month',5000) on conflict(user_id,month) do update set amount=5000;
select budget_tracker.prepare_dashboard(date_trunc('month',now() at time zone 'Asia/Manila')::date);
do $$begin if (budget_tracker.dashboard_snapshot(date_trunc('month',now() at time zone 'Asia/Manila')::date)->>'limitCents')::numeric<>500000 then raise exception 'Limit not inherited';end if;end$$;
select 'PASS profile timezone and monthly inheritance' as result;

select budget_tracker.save_recurring_rule(jsonb_build_object('categoryId','00000000-0000-4000-8000-000000000003','amount','100.00','note','Synthetic bill','frequency','monthly','nextDueDate',(now() at time zone 'Asia/Manila')::date,'monthEnd',false));
select budget_tracker.prepare_dashboard(date_trunc('month',now() at time zone 'Asia/Manila')::date);
do $$declare n integer;begin select count(*) into n from budget_tracker.recurring_occurrences where label='Synthetic bill' and state='recorded';if n<>1 then raise exception 'Bill not recorded exactly once: %',n;end if;end$$;
select budget_tracker.prepare_dashboard(date_trunc('month',now() at time zone 'Asia/Manila')::date);
do $$begin if (select count(*) from budget_tracker.transactions where note='Synthetic bill')<>1 then raise exception 'Catch-up duplicated';end if;end$$;
select pg_temp.expect_error($q$update budget_tracker.recurring_rules set amount=20 where note='Synthetic bill'$q$,'42501');
select pg_temp.expect_error($q$delete from budget_tracker.transactions where note='Synthetic bill'$q$,'42501');
select 'PASS atomic catch-up, replay and legacy write rejection' as result;

select budget_tracker.bill_command(id,'replace') from budget_tracker.recurring_occurrences where label='Synthetic bill' and state='recorded';
select budget_tracker.prepare_dashboard(date_trunc('month',now() at time zone 'Asia/Manila')::date);
do $$begin if exists(select from budget_tracker.transactions where note='Synthetic bill') then raise exception 'Replacement regenerated';end if;if not exists(select from budget_tracker.recurring_occurrences where label='Synthetic bill' and state='replacement') then raise exception 'Replacement not reserved';end if;end$$;
select budget_tracker.bill_command(id,'record',jsonb_build_object('payload_version',2,'operation','create','id','00000000-0000-4000-8000-000000000080','type','expense','category_id','00000000-0000-4000-8000-000000000003','amount','100.00','note','Replacement bill','occurred_at',now(),'transaction_date',(now() at time zone 'Asia/Manila')::date),'[]') from budget_tracker.recurring_occurrences where label='Synthetic bill' and state='replacement';
do $$declare bill uuid;begin select id into bill from budget_tracker.recurring_occurrences where transaction_id='00000000-0000-4000-8000-000000000080';perform pg_temp.expect_error(format($q$select budget_tracker.bill_command(%L,'edit',jsonb_build_object('payload_version',2,'category_id','00000000-0000-4000-8000-000000000003','amount','80.00','note','Changed payment','occurred_at',now()),'[]')$q$,bill),'22023');if(select amount from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000080')<>100 then raise exception 'Failed edit changed amount';end if;end$$;
select budget_tracker.bill_command(id,'edit',jsonb_build_object('payload_version',2,'category_id','00000000-0000-4000-8000-000000000003','amount','80.00','note','Confirmed edit','occurred_at',now()),'[]',true) from budget_tracker.recurring_occurrences where transaction_id='00000000-0000-4000-8000-000000000080';
select 'PASS linked amount edit confirmation and rollback' as result;
select budget_tracker.bill_command(id,'skip') from budget_tracker.recurring_occurrences where transaction_id='00000000-0000-4000-8000-000000000080';
select budget_tracker.prepare_dashboard(date_trunc('month',now() at time zone 'Asia/Manila')::date);
do $$begin if exists(select from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000080') then raise exception 'Deleted bill regenerated';end if;end$$;
select 'PASS replacement and delete/skip do not regenerate' as result;

select budget_tracker.save_recurring_rule(jsonb_build_object('categoryId','00000000-0000-4000-8000-000000000003','amount','100.00','note','Future bill','frequency','monthly','nextDueDate',((now() at time zone 'Asia/Manila')::date+1),'monthEnd',false));
select budget_tracker.prepare_dashboard((date_trunc('month',now() at time zone 'Asia/Manila')+interval '1 month')::date);
select budget_tracker.save_transaction(jsonb_build_object('payload_version',2,'operation','create','id','00000000-0000-4000-8000-000000000081','type','expense','category_id','00000000-0000-4000-8000-000000000003','amount','90.00','note','Early bill','occurred_at',now(),'transaction_date',(now() at time zone 'Asia/Manila')::date),'[]');
do $$declare bill uuid;begin select id into bill from budget_tracker.recurring_occurrences where label='Future bill' order by scheduled_date limit 1;perform pg_temp.expect_error(format('select budget_tracker.bill_command(%L,''link'','' {"id":"00000000-0000-4000-8000-000000000081"}''::jsonb)',bill),'22023');end$$;
select budget_tracker.bill_command(id,'link','{"id":"00000000-0000-4000-8000-000000000081"}','[]',true) from budget_tracker.recurring_occurrences where label='Future bill' order by scheduled_date limit 1;
select budget_tracker.bill_command(id,'convert_income',jsonb_build_object('payload_version',2,'amount','90.00','note','Income conversion','occurred_at',now()),'[]') from budget_tracker.recurring_occurrences where transaction_id='00000000-0000-4000-8000-000000000081';
do $$begin if (select type from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000081')<>'income' then raise exception 'Conversion failed';end if;if exists(select from budget_tracker.recurring_occurrences where transaction_id='00000000-0000-4000-8000-000000000081') then raise exception 'Conversion retained bill';end if;end$$;
select 'PASS mismatched settlement confirmation and atomic income conversion' as result;

select budget_tracker.save_recurring_rule(jsonb_build_object('id',id,'command','pause')) from budget_tracker.recurring_rules where note='Future bill';
select budget_tracker.save_recurring_rule(jsonb_build_object('id',id,'command','resume')) from budget_tracker.recurring_rules where note='Future bill';
select budget_tracker.save_recurring_rule(jsonb_build_object('id',id,'command','archive')) from budget_tracker.recurring_rules where note='Future bill';
do $$begin if not exists(select from budget_tracker.recurring_rules where note='Future bill' and archived and not active) then raise exception 'Archive failed';end if;end$$;
select 'PASS pause/resume/archive preserve history' as result;
reset role;
do $$begin if budget_tracker.next_rule_date(date '2024-01-31','monthly',31,false)<>date '2024-02-29' or budget_tracker.next_rule_date(date '2024-02-29','monthly',31,false)<>date '2024-03-31' then raise exception 'Anchor drift';end if;end$$;
select 'PASS monthly anchor and leap-year schedule' as result;
set role authenticated;
do $$declare previous numeric; snapshot jsonb; month date:=date_trunc('month',now() at time zone 'Asia/Manila')::date;
begin
 snapshot:=budget_tracker.dashboard_snapshot(month);previous:=(snapshot->>'expenseCents')::numeric;
 insert into budget_tracker.transactions(user_id,category_id,type,amount,note,transaction_date)
 select auth.uid(),'00000000-0000-4000-8000-000000000003','expense',1,'Synthetic aggregation fixture',month from generate_series(1,1001);
 snapshot:=budget_tracker.dashboard_snapshot(month);
 if (snapshot->>'expenseCents')::numeric<>previous+100100 then raise exception 'Snapshot truncated transactions';end if;
end$$;
select 'PASS complete aggregation above 1000 transactions' as result;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$begin if exists(select from budget_tracker.profiles) or exists(select from budget_tracker.recurring_occurrences) then raise exception 'Foreign profile/bills visible';end if;end$$;
select 'PASS profile and occurrence tenant isolation' as result;
reset role;
