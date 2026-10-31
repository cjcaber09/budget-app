-- Optional wallet identifiers remain owner-private; card last-four rules are unchanged.
alter table budget_tracker.payment_methods add column wallet_account_number text;
alter table budget_tracker.payment_methods add constraint wallet_account_number_valid
 check(wallet_account_number is null or (method='wallet' and wallet_account_number ~ '^[+]?[0-9]{5,20}$'));
comment on column budget_tracker.payment_methods.wallet_account_number is 'Optional e-wallet account/phone identifier. Owner-only; mask outside editing. Never use for card numbers.';

-- Extend the installed RPC without replacing its later ownership, refund,
-- account-active, bill reassignment or balance-confirmation safeguards.
do $migration$
declare definition text; needle text; patched text; i integer;
 needles text[]:=array[
 $a$replacement uuid;$a$,
 $a$digits:=nullif(p_method->>'lastFour','');$a$,
 $a$existing.last_four is not distinct from digits and existing.opening_balance=balance$a$,
 $a$name,last_four,opening_balance,baseline_at) values(method_id,owner_id,kind,subtype,label,digits,balance,$a$,
 $a$payment_type=subtype,last_four=digits,opening_balance=balance$a$
 ];
 replacements text[]:=array[
 $b$replacement uuid;wallet_number text;$b$,
 $b$digits:=nullif(p_method->>'lastFour','');
 if p_method ? 'walletAccountNumber' and jsonb_typeof(p_method->'walletAccountNumber') not in ('string','null') then raise exception 'E-wallet account number must be text' using errcode='22023';end if;
 wallet_number:=case when p_method ? 'walletAccountNumber' then nullif(btrim(p_method->>'walletAccountNumber'),'') else existing.wallet_account_number end;
 if wallet_number is not null and (kind is distinct from 'wallet' or wallet_number !~ '^[+]?[0-9]{5,20}$') then raise exception 'Enter 5-20 digits for the e-wallet account number, with an optional leading +, or leave it blank' using errcode='22023';end if;$b$,
 $b$existing.last_four is not distinct from digits and existing.wallet_account_number is not distinct from wallet_number and existing.opening_balance=balance$b$,
 $b$name,last_four,wallet_account_number,opening_balance,baseline_at) values(method_id,owner_id,kind,subtype,label,digits,wallet_number,balance,$b$,
 $b$payment_type=subtype,last_four=digits,wallet_account_number=wallet_number,opening_balance=balance$b$
 ];
begin
 select pg_get_functiondef('budget_tracker.save_payment_method(jsonb)'::regprocedure) into definition;
 for i in 1..array_length(needles,1) loop
  needle:=needles[i];patched:=replace(definition,needle,replacements[i]);
  if patched=definition then raise exception 'Wallet save patch % did not match installed RPC',i;end if;
  definition:=patched;
 end loop;
 execute definition;
 select pg_get_functiondef('budget_tracker.payment_method_snapshot()'::regprocedure) into definition;
 patched:=replace(definition,'m.name,m.last_four,m.opening_balance','m.name,m.last_four,m.wallet_account_number,m.opening_balance');
 if patched=definition then raise exception 'Wallet snapshot field patch did not match';end if;
 definition:=replace(patched,'''owner'',auth.uid(),','''owner'',auth.uid(),''walletAccountNumberVersion'',1,');
 if definition=patched then raise exception 'Wallet snapshot capability patch did not match';end if;
 execute definition;
end $migration$;
notify pgrst,'reload schema';
