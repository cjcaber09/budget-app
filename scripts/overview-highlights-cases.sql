insert into auth.users(id) values('00000000-0000-4000-8000-000000050001'),('00000000-0000-4000-8000-000000050002');
insert into budget_tracker.profiles(user_id,timezone,currency) values('00000000-0000-4000-8000-000000050001','Asia/Manila','PHP'),('00000000-0000-4000-8000-000000050002','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000050001';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare cash budget_tracker.payment_methods;bank budget_tracker.payment_methods;wallet budget_tracker.payment_methods;refund_only budget_tracker.payment_methods;e budget_tracker.transactions;old_e budget_tracker.transactions;
 c uuid;empty_c uuid;tid uuid;out jsonb;today date:=(now() at time zone 'Asia/Manila')::date;month date:=date_trunc('month',today)::date;prior date:=(date_trunc('month',today)-interval '1 day')::date;
begin
 perform budget_tracker.payment_method_snapshot();select * into cash from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';
 bank:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','bank_account','paymentType','Savings account','name','Duplicate bank','openingBalance','10000.00'));
 wallet:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','wallet','paymentType','E-wallet','name','Duplicate bank','openingBalance','0.00'));
 refund_only:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','other','paymentType','Other','name','Refund only','openingBalance','0.00'));
 insert into budget_tracker.categories(user_id,name,color,icon)values(auth.uid(),'Synthetic category','#55816A','tag') returning id into c;
 insert into budget_tracker.categories(user_id,name,color,icon)values(auth.uid(),'No spending','#55816A','tag') returning id into empty_c;
 e:=budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','type','expense','amount','100.00','category_id',c,'payment_method_id',bank.id,'transaction_date',today,'occurred_at',now(),'note',null,'payload_version',4),'[]');
 perform budget_tracker.save_refund(jsonb_build_object('id',gen_random_uuid(),'expenseId',e.id,'expenseCreatedAt',e.created_at,'operation','create','amount','40.00','methodId',bank.id,'date',today));
 perform budget_tracker.save_refund(jsonb_build_object('id',gen_random_uuid(),'expenseId',e.id,'expenseCreatedAt',e.created_at,'operation','create','amount','10.00','methodId',refund_only.id,'date',today));
 perform budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','type','income','amount','500.00','category_id',null,'payment_method_id',wallet.id,'transaction_date',today,'occurred_at',now(),'note',null,'payload_version',4),'[]');
 perform budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','type','expense','amount','30.00','category_id',c,'payment_method_id',wallet.id,'transaction_date',today,'occurred_at',now(),'note',null,'payload_version',4),'[]');
 -- A future expense still belongs in this recorded month's rankings and Recent.
 perform budget_tracker.save_transaction(jsonb_build_object('id',gen_random_uuid(),'operation','create','type','expense','amount','20.00','category_id',c,'payment_method_id',wallet.id,'transaction_date',(month+interval '1 month'-interval '1 day')::date,'occurred_at',now(),'note',null,'payload_version',4),'[]');
 update budget_tracker.transactions set category_id=null where user_id=auth.uid() and payment_method_id=wallet.id and type='expense';
 tid:=gen_random_uuid();perform budget_tracker.save_transfer_entry(jsonb_build_object('payload_version',3,'id',tid,'requestId',tid,'operation','create','sourceId',bank.id,'destinationId',cash.id,'amount','1000.00','feeAmount','2.00','feeMode','added','date',today));
 out:=budget_tracker.overview_highlights(month);
 if out->>'owner'<>auth.uid()::text or out->>'month'<>month::text or out->>'timezone'<>'Asia/Manila' or out->>'today'<>today::text then raise exception 'envelope context mismatch';end if;
 if jsonb_array_length(out->'recent')<>5 or jsonb_array_length(out->'categories')<>3 or jsonb_array_length(out->'methods')<>2 then raise exception 'wrong list sizes';end if;
 if not exists(select from jsonb_array_elements(out->'methods')r where r->>'id'=bank.id::text and (r->>'count')::int=2 and r->>'spent'='6200') then raise exception 'refund counted as payment, fee missed or principal counted';end if;
 if not exists(select from jsonb_array_elements(out->'methods')r where r->>'id'=wallet.id::text and (r->>'count')::int=2 and r->>'spent'='5000') then raise exception 'income counted or duplicate names merged';end if;
 if (out->'categories'->0->>'key')<>c::text or not exists(select from jsonb_array_elements(out->'categories')r where r->>'key'='uncategorized' and r->>'spent'='5000') or not exists(select from jsonb_array_elements(out->'categories')r where r->>'name'='Fees' and r->>'spent'='200') then raise exception 'net category ranking wrong';end if;
 if not exists(select from jsonb_array_elements(out->'recent')r where r->>'type'='transfer') then raise exception 'transfer missing from recent';end if;
 -- Refund-only methods and empty categories never become zero-filled ranking rows.
 if exists(select from jsonb_array_elements(out->'methods')r where r->>'id'=refund_only.id::text) then raise exception 'refund-only use included';end if;
 perform budget_tracker.save_payment_method(jsonb_build_object('id',bank.id,'operation','archive'));
 out:=budget_tracker.overview_highlights(month);
 if not exists(select from jsonb_array_elements(out->'methods')r where r->>'id'=bank.id::text and (r->>'archived')::boolean) then raise exception 'archived history lost';end if;
 -- Keep IDs for privileged bulk fixtures, all rolled back.
 perform set_config('overview_test.cash',cash.id::text,true);perform set_config('overview_test.category',c::text,true);
 begin perform budget_tracker.overview_highlights(month+1);raise exception 'non-month date accepted';exception when sqlstate '22023' then null;end;
 begin perform budget_tracker.overview_highlights((month+interval '25 months')::date);raise exception 'unsupported future accepted';exception when sqlstate '22023' then null;end;
 if jsonb_array_length(budget_tracker.overview_highlights((month+interval '1 month')::date)->'recent')<>0 then raise exception 'empty month fabricated activity';end if;
end $$;
reset role;
-- Complete aggregation beyond PostgREST's 1000-row limit, null/explicit Cash and legacy timezone date.
insert into budget_tracker.transactions(id,user_id,type,category_id,payment_method_id,amount,transaction_date,occurred_at)
select gen_random_uuid(),'00000000-0000-4000-8000-000000050001','expense',current_setting('overview_test.category')::uuid,
 case when i%2=0 then current_setting('overview_test.cash')::uuid else null end,10000000,date_trunc('month',now() at time zone 'Asia/Manila')::date,
 now()-interval '1 hour' from generate_series(1,1004)i;
insert into budget_tracker.transactions(id,user_id,type,category_id,amount,transaction_date,occurred_at)
values(gen_random_uuid(),'00000000-0000-4000-8000-000000050001','expense',current_setting('overview_test.category')::uuid,1,null,
 date_trunc('month',now() at time zone 'Asia/Manila') at time zone 'Asia/Manila');
set local role authenticated;
do $$declare out jsonb;month date:=date_trunc('month',now() at time zone 'Asia/Manila')::date;begin
 out:=budget_tracker.overview_highlights(month);
 if not exists(select from jsonb_array_elements(out->'methods')r where r->>'key'='cash' and r->>'count'='1005' and r->>'spent'='1004000000100') then raise exception 'complete counts or Cash normalization failed';end if;
 if out->'categories'->0->>'spent'<>'1004000005100' then raise exception 'large aggregate truncated';end if;
 if jsonb_array_length(out->'recent')<>5 then raise exception 'recent not bounded';end if;
 if has_function_privilege('anon','budget_tracker.overview_highlights(date)','EXECUTE') or not has_function_privilege('authenticated','budget_tracker.overview_highlights(date)','EXECUTE') then raise exception 'RPC grants wrong';end if;
 if (select prosecdef or provolatile<>'s' from pg_proc where oid='budget_tracker.overview_highlights(date)'::regprocedure) then raise exception 'RPC is not stable invoker';end if;
end $$;
reset role;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000050002';set local role authenticated;
do $$declare out jsonb;begin
 out:=budget_tracker.overview_highlights(date_trunc('month',now() at time zone 'UTC')::date);
 if jsonb_array_length(out->'recent')<>0 or jsonb_array_length(out->'categories')<>0 or jsonb_array_length(out->'methods')<>0 then raise exception 'foreign owner history leaked';end if;
end $$;
-- Ties remain deterministic and each list is capped only after complete aggregation.
do $$declare m budget_tracker.payment_methods;c uuid;i integer;out jsonb;month date:=date_trunc('month',now() at time zone 'UTC')::date;n integer;begin
 for i in 1..6 loop
  m:=budget_tracker.save_payment_method(jsonb_build_object('id',gen_random_uuid(),'operation','create','method','bank_account','paymentType','Savings account','name','Rank 0'||i,'openingBalance','0.00'));
  insert into budget_tracker.categories(user_id,name,color,icon)values(auth.uid(),'Rank 0'||i,'#55816A','tag') returning id into c;
  insert into budget_tracker.transactions(id,user_id,type,category_id,payment_method_id,amount,transaction_date,occurred_at)
  select gen_random_uuid(),auth.uid(),'expense',c,m.id,1,month,now() from generate_series(1,3);
 end loop;
 select count(*) into n from budget_tracker.transactions where user_id=auth.uid();
 out:=budget_tracker.overview_highlights(month);
 if jsonb_array_length(out->'methods')<>5 or jsonb_array_length(out->'categories')<>5 or out->'methods'->0->>'name'<>'Rank 01' or out->'methods'->4->>'name'<>'Rank 05' or out->'categories'->0->>'name'<>'Rank 01' or out->'categories'->4->>'name'<>'Rank 05' then raise exception 'top five or deterministic ties failed';end if;
 if n<>(select count(*) from budget_tracker.transactions where user_id=auth.uid()) then raise exception 'read RPC wrote financial data';end if;
end $$;
reset role;
set local request.jwt.claim.sub='';set local role authenticated;
do $$begin begin perform budget_tracker.overview_highlights(date_trunc('month',now())::date);raise exception 'missing auth accepted';exception when sqlstate '42501' then null;end;end $$;
reset role;
set constraints all immediate;
