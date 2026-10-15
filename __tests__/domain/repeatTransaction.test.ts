import {canRepeatTransaction,repeatTransactionValues} from '../../src/domain/repeatTransaction';
const purchase:any={id:'purchase',user_id:'owner',type:'expense',amount:12.50,note:'Coffee',category_id:'category',payment_method_id:'archived',payment_details:{reference:'OLD'},occurred_at:'2026-01-01T00:00:00Z'};
const item:any={kind:'item',label:'Coffee',amountCents:1250,quantity:null,unitPriceCents:null,taxIncluded:false};
test('repeat creates today values and copies rows without payment references or mutation',()=>{
 const result=repeatTransactionValues(purchase,[item],[{id:'category',user_id:'owner'} as any],[],[],'2026-10-13','owner');
 expect(result.values).toMatchObject({transactionDate:'2026-10-13',amount:'12.5',paymentDetails:null,paymentMethodId:null,categoryId:'category'});
 expect(result.warnings[0]).toContain('Cash is selected');result.values.items![0].label='Changed';expect(item.label).toBe('Coffee');
});
test('refunds, linked bills, transfer fees and foreign purchases cannot be repeated',()=>{
 for(const changes of [{type:'refund'},{occurrence_id:'bill'},{recurring_rule_id:'rule'},{transfer_id:'transfer'}])expect(canRepeatTransaction({...purchase,...changes})).toBe(false);
 expect(()=>repeatTransactionValues(purchase,[],[],[],[],'2026-10-13','foreign')).toThrow();
});
