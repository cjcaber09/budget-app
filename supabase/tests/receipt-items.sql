insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into budget_tracker.categories(id,user_id,name,color,icon) values
 ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','Groceries','#55816A','cart');
create function pg_temp.assert_error(statement text, expected_state text) returns void language plpgsql as $$
begin
  begin
    execute statement;
    set constraints all immediate;
  exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected %, received %', expected_state, sqlstate;
  end;
  raise exception 'Expected rejection: %', expected_state;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select budget_tracker.save_transaction(
 '{"operation":"create","id":"00000000-0000-4000-8000-000000000010","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"1.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}',
 '[{"kind":"item","label":"Bread","amount":"10.00","quantity":"2","unit_price":"3.00","tax_included":false},{"kind":"deduction","label":"Coupon","amount":"1.00","quantity":null,"unit_price":null,"tax_included":false},{"kind":"tax","label":"VAT","amount":"2.00","quantity":null,"unit_price":null,"tax_included":true},{"kind":"tax","label":"Tax","amount":"0.50","quantity":null,"unit_price":null,"tax_included":false},{"kind":"fee","label":"Fee","amount":"1.00","quantity":null,"unit_price":null,"tax_included":false}]');
do $$ begin if (select amount from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000010') <> 10.50 then raise exception 'Wrong exact total'; end if; end $$;
select 'PASS exact total and metadata' as result;
do $$ begin
  if budget_tracker.item_total('[{"kind":"item","amount":"1.005","tax_included":false},{"kind":"adjustment","amount":"-1.005","tax_included":false}]') <> 0
    or budget_tracker.item_total('[{"kind":"item","amount":"1.005","tax_included":false}]') <> 1.01 then raise exception 'SQL rounding diverges from cents'; end if;
end $$;
select pg_temp.assert_error($q$update budget_tracker.transactions set amount=8 where id='00000000-0000-4000-8000-000000000010'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set amount=11 where kind='item'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transactions set type='income' where id='00000000-0000-4000-8000-000000000010'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set amount='NaN'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transactions set amount='NaN'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set quantity='NaN' where kind='item'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set kind='unknown'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set label=chr(160)||chr(65279)$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set tax_included=true where kind='item'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set user_id='00000000-0000-4000-8000-000000000002'$q$,'23514');
select 'PASS direct-write integrity and finite bounds' as result;
select pg_temp.assert_error($q$select budget_tracker.save_transaction('{"operation":"create","id":"00000000-0000-4000-8000-000000000010","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"12.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[]')$q$,'23505');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin if exists(select 1 from budget_tracker.transaction_items) or exists(select 1 from budget_tracker.transactions) then raise exception 'Tenant leak'; end if; end $$;
select pg_temp.assert_error($q$select budget_tracker.save_transaction('{"operation":"update","id":"00000000-0000-4000-8000-000000000010","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"12.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[]')$q$,'42501');
select 'PASS tenant isolation and create conflict' as result;
select pg_temp.assert_error($q$insert into budget_tracker.transaction_items(transaction_id,user_id,kind,label,amount,position) values('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000002','item','Foreign parent',1,10)$q$,'23503');
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select budget_tracker.save_transaction('{"operation":"update","id":"00000000-0000-4000-8000-000000000010","type":"income","category_id":null,"amount":"12.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[]');
do $$ begin if exists(select 1 from budget_tracker.transaction_items) then raise exception 'Income retained rows'; end if; end $$;
select pg_temp.assert_error($q$select budget_tracker.save_transaction('{"operation":"update","id":"00000000-0000-4000-8000-000000000010","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"12.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[{"kind":"item","label":"Bad","amount":"NaN","quantity":null,"unit_price":null,"tax_included":false}]')$q$,'22023');
do $$ begin if (select type from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000010') <> 'income' then raise exception 'Failed save changed parent'; end if; end $$;
select 'PASS income clearing and atomic rejection' as result;
select budget_tracker.save_transaction('{"operation":"update","id":"00000000-0000-4000-8000-000000000010","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"12.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[{"kind":"item","label":"Bread","amount":"10.00","quantity":null,"unit_price":null,"tax_included":false}]');
delete from budget_tracker.transaction_items;
do $$ begin if (select amount from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000010') <> 10 then raise exception 'Last-row deletion changed manual amount'; end if; end $$;
select 'PASS last-row deletion' as result;
select pg_temp.assert_error($q$insert into budget_tracker.transaction_items(transaction_id,user_id,kind,label,amount,position)
  select '00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001','item','Too many rows',10.0/101,n from generate_series(0,100) n$q$,'23514');
select budget_tracker.save_transaction('{"operation":"create","id":"00000000-0000-4000-8000-000000000011","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"3.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[]');
select budget_tracker.save_transaction('{"operation":"create","id":"00000000-0000-4000-8000-000000000011","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"3.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[]');
do $$ begin if (select count(*) from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000011') <> 1 then raise exception 'Create retry duplicated transaction'; end if; end $$;
select budget_tracker.save_transaction('{"operation":"update","id":"00000000-0000-4000-8000-000000000011","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"3.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[{"kind":"item","label":"Bread","amount":"3.00","quantity":null,"unit_price":null,"tax_included":false}]');
delete from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000011';
do $$ begin if exists(select from budget_tracker.transaction_items where transaction_id='00000000-0000-4000-8000-000000000011') then raise exception 'Parent cascade left items'; end if; end $$;
select 'PASS row cap, create retry and parent cascade' as result;
insert into budget_tracker.recurring_rules(id,user_id,category_id,amount,frequency,next_occurrence_date)
 values('00000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',5,'weekly','2026-10-07');
insert into budget_tracker.transactions(id,user_id,category_id,amount,recurring_rule_id)
 values('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000003',5,'00000000-0000-4000-8000-000000000006');
select budget_tracker.save_transaction('{"operation":"update","id":"00000000-0000-4000-8000-000000000012","type":"expense","category_id":"00000000-0000-4000-8000-000000000003","amount":"6.00","note":null,"occurred_at":"2026-10-07T00:00:00Z"}','[]');
do $$ begin if (select recurring_rule_id from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000012') <> '00000000-0000-4000-8000-000000000006'::uuid then raise exception 'Edit lost recurring provenance'; end if; end $$;
select 'PASS no-row recurring insert and immutable provenance' as result;
set role anon;
select pg_temp.assert_error($q$select budget_tracker.save_transaction('{}','[]')$q$,'42501');
select 'PASS anonymous RPC rejection' as result;
reset role;
