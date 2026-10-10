// Seeds additive, clearly labeled report examples for an existing account.
// Default is read-only preview. --apply writes through owner-checked app RPCs.
// Existing transactions, budgets, allowances, preferences and balances stay intact.
import {loadLinkedProject,queryDatabase} from './lib/supabase-project.mjs';
const email=process.argv.find(arg=>arg.startsWith('--email='))?.slice(8);
if(!email || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Provide --email=<existing-account-email>.');
const target=email.toLowerCase().replaceAll("'", "''");
const project=loadLinkedProject();
const lookup=await queryDatabase(project,`select count(*)::int as accounts from auth.users where lower(email)='${target}'`);
if(lookup[0]?.accounts!==1)throw new Error('Exactly one existing account must match.');
if(!process.argv.includes('--apply')) {
 console.log('Preview: add up to 60 labeled income/expense examples across six months; create only missing allowances and category budgets within available capacity. Existing data is preserved. Use --apply to seed.');
 process.exit(0);
}
const query=`begin;
create temporary table demo_seed_result(summary jsonb) on commit drop;
grant insert,select on demo_seed_result to authenticated;
select set_config('request.jwt.claim.sub',(select id::text from auth.users where lower(email)='${target}'),true);
set local role authenticated;
do $seed$
declare
 owner_id uuid:=auth.uid();
 zone text;today date;current_month date;m date;d date;
 cat_id uuid;tx_id uuid;row record;idx integer;allowance numeric;capacity numeric;planned numeric;
 factors numeric[]:=array[0.75,0.95,1.10,0.90,1.20,0.80];
 seed_tag constant text:='[Demo reports] ';
 seed_key constant text:='report-demo-v1:';
 tx_created integer:=0;budgets_created integer:=0;limits_created integer:=0;
 prior_tx jsonb;prior_budgets jsonb;prior_limits jsonb;
begin
 if owner_id is null then raise exception 'Target account unavailable';end if;
 perform budget_tracker.financial_lock();
 select timezone into zone from budget_tracker.profiles where user_id=owner_id;
 zone:=coalesce(zone,'UTC');today:=(now() at time zone zone)::date;current_month:=date_trunc('month',today)::date;
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into prior_tx from budget_tracker.transactions t where user_id=owner_id;
 select coalesce(jsonb_agg(to_jsonb(b)),'[]') into prior_budgets from budget_tracker.budgets b where user_id=owner_id;
 select coalesce(jsonb_agg(to_jsonb(l)),'[]') into prior_limits from budget_tracker.monthly_limits l where user_id=owner_id;
 for idx in 0..5 loop
  m:=(current_month-make_interval(months=>5-idx))::date;
  select amount into allowance from budget_tracker.monthly_limits where user_id=owner_id and month=m;
  if not found then
   perform budget_tracker.set_monthly_allowance(m,'101.00');allowance:=101;limits_created:=limits_created+1;
  end if;
  for row in select * from (values
   ('Groceries',25.00),('Rent',30.00),('Transport',10.00),('Utilities',10.00),('Entertainment',10.00),('Health',10.00),('Other',5.00)
  ) as v(category,amount) loop
   select id into cat_id from budget_tracker.categories where user_id=owner_id and name=row.category order by id limit 1;
   if cat_id is null then continue;end if;
   if exists(select from budget_tracker.budgets where user_id=owner_id and category_id=cat_id and month=m) then continue;end if;
   select greatest(0,allowance-coalesce(sum(amount),0)) into capacity from budget_tracker.budgets where user_id=owner_id and month=m;
   planned:=least(row.amount,capacity);
   if planned>0 then perform budget_tracker.set_category_budget(cat_id,m,planned::numeric(12,2)::text);budgets_created:=budgets_created+1;end if;
  end loop;
  for row in select * from (values
   ('income',null::text,'Salary',200.00,1),
   ('income',null::text,'Freelance payment',30.00,6),
   ('expense','Groceries','Weekly groceries',18.00,2),
   ('expense','Groceries','Pantry top-up',12.00,7),
   ('expense','Rent','Rent payment',35.00,1),
   ('expense','Transport','Bus and train fares',10.00,4),
   ('expense','Utilities','Utilities payment',8.00,5),
   ('expense','Entertainment','Movies and dining',15.00,8),
   ('expense','Health','Pharmacy visit',5.00,3),
   ('expense','Other','Household supplies',5.00,6)
  ) as v(tx_type,category,label,amount,day_number) loop
   cat_id:=null;
   if row.category is not null then
    select id into cat_id from budget_tracker.categories where user_id=owner_id and name=row.category order by id limit 1;
    if cat_id is null then continue;end if;
   end if;
   d:=m+row.day_number-1;
   if d>today then continue;end if;
   tx_id:=overlay(overlay(md5(seed_key||owner_id::text||':'||m::text||':'||row.label) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid;
   if exists(select from budget_tracker.transactions where id=tx_id and user_id=owner_id) then continue;end if;
   planned:=case when row.tx_type='income' then row.amount else round(row.amount*factors[idx+1],2) end;
   perform budget_tracker.save_transaction(jsonb_build_object(
    'operation','create','payload_version',3,'id',tx_id,'type',row.tx_type,'category_id',cat_id,
    'amount',planned::numeric(12,2)::text,'note',seed_tag||row.label,
    'occurred_at',(d::timestamp+interval '12 hours') at time zone zone,'transaction_date',d
   ),'[]'::jsonb);
   tx_created:=tx_created+1;
  end loop;
 end loop;
 if exists(select from jsonb_array_elements(prior_tx) original left join budget_tracker.transactions t on t.id=(original->>'id')::uuid where to_jsonb(t) is distinct from original) then raise exception 'Existing transaction changed';end if;
 if exists(select from jsonb_array_elements(prior_budgets) original left join budget_tracker.budgets b on b.id=(original->>'id')::uuid where to_jsonb(b) is distinct from original) then raise exception 'Existing budget changed';end if;
 if exists(select from jsonb_array_elements(prior_limits) original left join budget_tracker.monthly_limits l on l.user_id=owner_id and l.month=(original->>'month')::date where to_jsonb(l) is distinct from original) then raise exception 'Existing allowance changed';end if;
 if exists(select from budget_tracker.budgets b join budget_tracker.monthly_limits l on l.user_id=b.user_id and l.month=b.month where b.user_id=owner_id and b.month between (current_month-interval '5 months')::date and current_month group by b.month,l.amount having sum(b.amount)>l.amount) then raise exception 'Category allocation exceeds allowance';end if;
 insert into demo_seed_result values(jsonb_build_object('transactions_created',tx_created,'budgets_created',budgets_created,'allowances_created',limits_created));
end $seed$;
set constraints all immediate;
reset role;
select summary from demo_seed_result;
commit;`;
const rows=await queryDatabase(project,query);
const summary=rows.find(row=>row?.summary)?.summary;
for(const key of ['transactions_created','budgets_created','allowances_created']) {
 if(!Number.isSafeInteger(summary?.[key])||summary[key]<0)throw new Error('Seed summary was incomplete. Re-run safely to confirm.');
}
// Print validated counts only, never user content or remote diagnostic bodies.
console.log('Seed complete: '+Number(summary.transactions_created)+' transactions, '+Number(summary.budgets_created)+' category budgets, '+Number(summary.allowances_created)+' monthly allowances added. Existing records preserved.');
