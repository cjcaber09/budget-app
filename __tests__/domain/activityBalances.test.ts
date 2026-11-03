import {decodeActivityBalances,transactionBalanceActivity} from '../../src/domain/activityBalances';
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',methodId='00000000-0000-4000-8000-000000000003';
const context={owner,timezone:'Asia/Manila',today:'2026-11-03'},requested=[{kind:'transaction' as const,id}];
const account={methodId,name:'Cash',method:'cash',paymentType:'Cash',state:'applied',beforeCents:'10000',changeCents:'-5000',afterCents:'5000'};
const fixture=()=>({...context,reconciled:true,rows:[{kind:'transaction',id,accounts:[{...account}]}]});
test('decodes an exact Cash 50 deduction without using rendered transaction amounts',()=>{
 expect(decodeActivityBalances(fixture(),context,requested)[0].accounts[0]).toMatchObject({beforeCents:10000,changeCents:-5000,afterCents:5000});
});
test.each(['owner','timezone','today','reconciled'])('rejects incorrect %s context',key=>{
 expect(()=>decodeActivityBalances({...fixture(),[key]:key==='reconciled'?false:'foreign'},context,requested)).toThrow();
});
test('rejects mismatched arithmetic, unsafe cents and unrequested rows',()=>{
 for(const patch of [{afterCents:'5001'},{beforeCents:'9007199254740992'},{changeCents:-5000}]){
  const data=fixture();Object.assign(data.rows[0].accounts[0],patch);expect(()=>decodeActivityBalances(data,context,requested)).toThrow();
 }
 expect(()=>decodeActivityBalances({...fixture(),rows:[{kind:'transaction',id:methodId,accounts:[]}]},context,requested)).toThrow();
});
test.each(['unset','opening','scheduled'])('%s records never fabricate before/after amounts',state=>{
 const data=fixture();Object.assign(data.rows[0].accounts[0],{state,beforeCents:null,afterCents:null});
 expect(decodeActivityBalances(data,context,requested)[0].accounts[0]).toMatchObject({state,beforeCents:null,afterCents:null});
 Object.assign(data.rows[0].accounts[0],{beforeCents:'0'});expect(()=>decodeActivityBalances(data,context,requested)).toThrow();
});
test('rejects duplicate accounts and accepts unavailable records without invented Cash',()=>{
 const data=fixture();data.rows[0].accounts.push({...account});expect(()=>decodeActivityBalances(data,context,requested)).toThrow();
 expect(decodeActivityBalances({...fixture(),rows:[{kind:'transaction',id,accounts:[]}]},context,requested)[0].accounts).toEqual([]);
});
test('retains signed credit-card debt and maps linked fees/refunds to the right activity',()=>{
 const data=fixture();Object.assign(data.rows[0].accounts[0],{method:'card',paymentType:'Credit card',beforeCents:'-10000',afterCents:'-15000'});
 expect(decodeActivityBalances(data,context,requested)[0].accounts[0].afterCents).toBe(-15000);
 expect(transactionBalanceActivity({id,type:'expense',transfer_id:methodId})).toEqual({kind:'transfer',id:methodId});
 expect(transactionBalanceActivity({id,type:'refund'})).toEqual({kind:'refund',id});
});
