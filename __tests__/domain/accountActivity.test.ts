import {accountActivity,searchAccountActivity} from '../../src/domain/accountActivity';
import type {PaymentMethod} from '../../src/domain/paymentMethods';
const method={id:'cash',user_id:'owner',method:'cash'} as PaymentMethod;
const transaction=(id:string,changes:any={})=>({id,user_id:'owner',payment_method_id:null,type:'expense',amount:10,note:'Coffee',financial_date:'2026-10-02',occurred_at:'2026-10-02T00:00:00Z',...changes});
test('Cash combines null and explicit assignments but excludes other owners/accounts/months',()=>{
 const rows=accountActivity(method,'2026-10-01','Asia/Manila',[transaction('1'),transaction('2',{payment_method_id:'cash',type:'refund'}),transaction('3',{payment_method_id:'other'}),transaction('4',{user_id:'foreign'}),transaction('5',{financial_date:'2026-09-30'})],[],[]);
 expect(rows).toHaveLength(2);expect(rows.map(r=>r.cents).sort()).toEqual([-1000,1000]);
});
test('transfers show principal and fee expense separately; corrections respect financial timezone',()=>{
 const rows=accountActivity(method,'2026-10-01','Asia/Manila',[transaction('fee',{transfer_id:'transfer',amount:2})],[{id:'transfer',source_id:'cash',destination_id:'other',source_name:'Cash',destination_name:'Same bank',transfer_date:'2026-10-02',amount:1000,fee_amount:200,fee_mode:'added',note:'Repayment'}],[{id:'correction',method_id:'cash',delta:'-0.50',target_balance:'10.00',created_at:'2026-09-30T17:00:00Z',note:'Statement'}]);
 expect(rows.map(r=>r.cents).reduce((a,b)=>a+b,0)).toBe(-1250);
 expect(searchAccountActivity(rows,'repayment same','all')).toHaveLength(1);
 expect(searchAccountActivity(rows,'0.50','correction')).toHaveLength(1);
});
test('complete history keeps more than 1000 entries and duplicate names never merge IDs',()=>{
 const bank={...method,id:'bank1',method:'bank_account'} as PaymentMethod;
 const rows=accountActivity(bank,'2026-10-01','UTC',Array.from({length:1004},(_,i)=>transaction(String(i),{payment_method_id:'bank1'})).concat(transaction('other',{payment_method_id:'bank2'})),[],[]);
 expect(rows).toHaveLength(1004);expect(searchAccountActivity(rows,'coffee','transaction')).toHaveLength(1004);
});
