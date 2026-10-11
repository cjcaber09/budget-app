import {expenseFundsWarning} from '../../src/domain/expenseFunds';
import type {PaymentMethod} from '../../src/domain/paymentMethods';
import type {Transaction} from '../../src/types/database';
const method:PaymentMethod={id:'cash',user_id:'u',method:'cash',payment_type:'Cash',name:'Cash',last_four:null,opening_balance:'100.00',baseline_at:'2026-10-01T00:00:00Z',balance:'40.00',archived:false,has_activity:true,related_bills:[]};
const expense={type:'expense',amount:50,paymentMethodId:null};
it('warns for insufficient funds but permits equality and income',()=>{
 expect(expenseFundsWarning(expense,[method])).toContain('already been paid');
 expect(expenseFundsWarning({...expense,amount:40},[method])).toBeNull();
 expect(expenseFundsWarning({...expense,type:'income'},[method])).toBeNull();
});
it('distinguishes an unset balance from zero and leaves credit debt unrestricted',()=>{
 expect(expenseFundsWarning(expense,[{...method,balance:null,baseline_at:null}])).toContain('Balance not set');
 expect(expenseFundsWarning(expense,[{...method,balance:'0.00'}])).toContain('exceeds');
 expect(expenseFundsWarning({...expense,paymentMethodId:'cash'},[{...method,method:'card',payment_type:'Credit card',balance:'-900.00'}])).toBeNull();
});
it('does not charge an existing expense twice, but does not refund future or pre-baseline entries',()=>{
 const previous={type:'expense',amount:60,payment_method_id:null,transaction_date:'2026-10-05',occurred_at:'2026-10-05T12:00:00Z'} as Transaction;
 expect(expenseFundsWarning({...expense,amount:65},[method],previous,'UTC','2026-10-11')).toBeNull();
 expect(expenseFundsWarning({...expense,amount:110},[method],previous,'UTC','2026-10-11')).toContain('exceeds');
 expect(expenseFundsWarning(expense,[method],{...previous,transaction_date:'2026-10-15'},'UTC','2026-10-11')).toContain('exceeds');
 expect(expenseFundsWarning(expense,[method],{...previous,transaction_date:'2026-09-30'},'UTC','2026-10-11')).toContain('exceeds');
});
