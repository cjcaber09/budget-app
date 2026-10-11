insert into auth.users(id)values('00000000-0000-4000-8000-000000047001'),('00000000-0000-4000-8000-000000047002');
insert into budget_tracker.profiles(user_id,timezone,currency)values('00000000-0000-4000-8000-000000047001','Asia/Manila','PHP'),('00000000-0000-4000-8000-000000047002','UTC','USD');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000047001';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$
declare c budget_tracker.payment_methods;r jsonb;baseline timestamptz;
begin
 perform budget_tracker.payment_method_snapshot();select * into c from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';
 begin perform budget_tracker.initialize_cash_balance(c.id,'-1.00');raise exception 'negative accepted';exception when sqlstate '22023' then null;end;
 begin perform budget_tracker.initialize_cash_balance(c.id,'10000000000.00');raise exception 'overflow accepted';exception when sqlstate '22023' then null;end;
 begin perform budget_tracker.initialize_cash_balance(c.id,'NaN');raise exception 'NaN accepted';exception when sqlstate '22023' then null;end;
 begin perform budget_tracker.initialize_cash_balance(c.id,'0.001');raise exception 'fraction accepted';exception when sqlstate '22023' then null;end;
 r:=budget_tracker.initialize_cash_balance(c.id,'0.00');
 if r->>'state'<>'initialized' or r->>'owner'<>auth.uid()::text or r->>'methodId'<>c.id::text then raise exception 'invalid response';end if;
 select baseline_at into baseline from budget_tracker.payment_methods where id=c.id;
 if baseline is null or (select (m->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods') m where m->>'id'=c.id::text)<>0 then raise exception 'zero not initialized';end if;
 r:=budget_tracker.initialize_cash_balance(c.id,'150.00');
 if r->>'state'<>'already_initialized' or (select opening_balance from budget_tracker.payment_methods where id=c.id)<>0 or (select baseline_at from budget_tracker.payment_methods where id=c.id)<>baseline then raise exception 'retry changed initialized Cash';end if;
 if exists(select from budget_tracker.transactions where user_id=auth.uid()) then raise exception 'initialization created income';end if;
end $$;
reset role;
select set_config('cash_help.foreign_id',(select id::text from budget_tracker.payment_methods where user_id='00000000-0000-4000-8000-000000047001' and method='cash'),true);
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000047002';set local role authenticated;
do $$
declare c budget_tracker.payment_methods;foreign_id uuid;
begin
 perform budget_tracker.payment_method_snapshot();select * into c from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';
 foreign_id:=current_setting('cash_help.foreign_id')::uuid;
 begin perform budget_tracker.initialize_cash_balance(foreign_id,'1.00');raise exception 'foreign accepted';exception when sqlstate '42501' then null;end;
 perform budget_tracker.initialize_cash_balance(c.id,'1234.56');
 if (select (m->>'balance')::numeric from jsonb_array_elements(budget_tracker.payment_method_snapshot()->'methods') m where m->>'id'=c.id::text)<>1234.56 then raise exception 'wrong exact amount';end if;
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','budget_tracker.initialize_cash_balance(uuid,text)','EXECUTE') then raise exception 'anonymous execution granted';end if;
end $$;
-- Synthetic service-side reset admission only; no worker, file removal or real reset.
set local request.jwt.claim.sub='';set local request.jwt.claim.role='service_role';
select budget_tracker.begin_financial_reset('00000000-0000-4000-8000-000000047002','00000000-0000-4000-8000-000000047102');
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000047002';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$declare c uuid;begin
 select id into c from budget_tracker.payment_methods where user_id=auth.uid() and method='cash';
 begin perform budget_tracker.initialize_cash_balance(c,'999.00');raise exception 'paused account allowed setup';exception when sqlstate '42501' then null;end;
end $$;
reset role;
set local request.jwt.claim.sub='';set local request.jwt.claim.role='authenticated';set local role authenticated;
do $$begin
 begin perform budget_tracker.initialize_cash_balance('00000000-0000-4000-8000-000000047102','0.00');raise exception 'missing auth accepted';exception when sqlstate '42501' then null;end;
end $$;
reset role;
