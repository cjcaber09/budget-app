import {totalCash} from '../../src/domain/totalCash';
const method=(id:string,kind:string,balance:string|null,payment_type='',extra:any={})=>({id,method:kind,balance,payment_type,user_id:'owner',archived:false,...extra}) as any;
test('combines eligible independent balances exactly, including overdrafts, without credit/Other/archived/foreign money',()=>{
 const methods=[method('cash','cash','10.01'),method('bank1','bank_account','20.02'),method('bank2','bank_account','-5.00'),method('wallet','wallet','3.04'),method('debit','card','4.05','Debit card'),method('prepaid','card','6.06','Prepaid card'),method('credit','card','999','Credit card'),method('other','other','999'),method('closed','bank_account','999','',{archived:true}),method('foreign','cash','999','',{user_id:'foreign'})];
 expect(totalCash(methods,'owner')).toEqual({cents:3818,unset:0});
});
test('unset balances never produce a partial total and zero is valid',()=>{
 expect(totalCash([method('cash','cash',null),method('bank','bank_account','5.00')],'owner')).toEqual({cents:null,unset:1});
 expect(totalCash([method('cash','cash','0.00')],'owner')).toEqual({cents:0,unset:0});
});
test('aggregate balance can exceed individual transaction cap but malformed/out-of-range values fail',()=>{
 expect(totalCash([method('cash','cash','10000000000.01')],'owner').cents).toBe(1000000000001);
 for(const value of ['NaN','90071992547409.92','1.001'])expect(()=>totalCash([method('cash','cash',value)],'owner')).toThrow();
 expect(()=>totalCash([],'owner')).toThrow();
});
