create function pg_temp.assert_error(statement text,expected_state text) returns void language plpgsql as $$
begin
  begin execute statement; set constraints all immediate;
  exception when others then if sqlstate=expected_state then return; end if;
    raise exception 'Expected %, received %',expected_state,sqlstate; end;
  raise exception 'Expected rejection: %',expected_state;
end $$;
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select budget_tracker.save_transaction('{"payload_version":2,"operation":"create","id":"00000000-0000-4000-8000-000000000020","type":"income","category_id":null,"amount":"990.00","note":"Salary","occurred_at":"2026-09-01T04:00:00Z","transaction_date":"2026-09-01","payment_details":{"documentKind":"salary","fromName":"Employer","fromNumber":"0912 *** 0042","fromNumberType":"phone","reference":"00001234"}}',
 '[{"kind":"item","label":"Salary payment","amount":"1000.00","quantity":null,"unit_price":null,"tax_included":false,"is_payment_summary":true,"affects_total":true},{"kind":"fee","label":"Recipient fee","amount":"10.00","quantity":null,"unit_price":null,"tax_included":false,"affects_total":true,"fee_party":"recipient"}]');
do $$ begin if (select amount from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000020') <> 990 then raise exception 'Income not net'; end if; end $$;
select 'PASS income rows, sender strings and calendar date' as result;
select pg_temp.assert_error($q$update budget_tracker.transaction_items set affects_total=false where transaction_id='00000000-0000-4000-8000-000000000020' and is_payment_summary$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transaction_items set kind='fee' where transaction_id='00000000-0000-4000-8000-000000000020' and is_payment_summary$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transactions set payment_details='{"fromName":42}' where id='00000000-0000-4000-8000-000000000020'$q$,'23514');
select pg_temp.assert_error($q$update budget_tracker.transactions set transaction_date='infinity' where id='00000000-0000-4000-8000-000000000020'$q$,'23514');
select pg_temp.assert_error($q$select budget_tracker.save_transaction('{"operation":"update","id":"00000000-0000-4000-8000-000000000020","type":"income","category_id":null,"amount":"990.00","note":"Salary","occurred_at":"2026-09-01T04:00:00Z"}','[]')$q$,'22023');
select 'PASS summary, metadata/date direct-write validation and legacy guard' as result;
select budget_tracker.save_transaction('{"payload_version":2,"operation":"create","id":"00000000-0000-4000-8000-000000000021","type":"income","category_id":null,"amount":"990.00","note":null,"occurred_at":"2026-10-07T04:00:00Z","transaction_date":"2026-10-07"}',
 '[{"kind":"item","label":"Net payment","amount":"990.00","quantity":null,"unit_price":null,"tax_included":false,"is_payment_summary":true,"affects_total":true},{"kind":"fee","label":"Already reflected fee","amount":"10.00","quantity":null,"unit_price":null,"tax_included":false,"affects_total":false,"fee_party":"recipient"}]');
do $$ begin if (select amount from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000021') <> 990 then raise exception 'Double-subtracted net fee'; end if; end $$;
select budget_tracker.save_transaction('{"payload_version":2,"operation":"create","id":"00000000-0000-4000-8000-000000000021","type":"income","category_id":null,"amount":"990.00","note":null,"occurred_at":"2026-10-07T04:00:00Z","transaction_date":"2026-10-07"}',
 '[{"kind":"item","label":"Net payment","amount":"990.00","quantity":null,"unit_price":null,"tax_included":false,"is_payment_summary":true,"affects_total":true},{"kind":"fee","label":"Already reflected fee","amount":"10.00","quantity":null,"unit_price":null,"tax_included":false,"affects_total":false,"fee_party":"recipient"}]');
select pg_temp.assert_error($q$select budget_tracker.save_transaction('{"payload_version":2,"operation":"create","id":"00000000-0000-4000-8000-000000000021","type":"income","category_id":null,"amount":"990.00","note":null,"occurred_at":"2026-10-07T04:00:00Z","transaction_date":"2026-10-08"}',
 '[{"kind":"item","label":"Net payment","amount":"990.00","quantity":null,"unit_price":null,"tax_included":false,"is_payment_summary":true,"affects_total":true},{"kind":"fee","label":"Already reflected fee","amount":"10.00","quantity":null,"unit_price":null,"tax_included":false,"affects_total":false,"fee_party":"recipient"}]')$q$,'23505');
select 'PASS informational counting and date-sensitive exact retries' as result;
select budget_tracker.save_transaction('{"payload_version":2,"operation":"update","id":"00000000-0000-4000-8000-000000000020","type":"income","category_id":null,"amount":"1000.00","note":"Salary","occurred_at":"2026-09-01T04:00:00Z"}',
 '[{"kind":"item","label":"Salary payment","amount":"1000.00","quantity":null,"unit_price":null,"tax_included":false,"is_payment_summary":true,"affects_total":true}]');
do $$ begin if (select payment_details->>'fromNumber' from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000020') <> '0912 *** 0042' or (select transaction_date from budget_tracker.transactions where id='00000000-0000-4000-8000-000000000020') <> date '2026-09-01' then raise exception 'Omitted metadata/date lost'; end if; end $$;
select 'PASS omitted details/date preserved atomically' as result;
reset role;
