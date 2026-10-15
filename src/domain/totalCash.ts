import {paymentBalanceCents,type PaymentMethod} from './paymentMethods';
export function totalCash(methods:PaymentMethod[],owner:string):{cents:number|null;unset:number} {
 const included=methods.filter(method=>method.user_id===owner&&!method.archived&&(method.method==='cash'||method.method==='bank_account'||method.method==='wallet'||method.method==='card'&&['Debit card','Prepaid card'].includes(method.payment_type)));
 if(!included.some(method=>method.method==='cash'))throw new Error('Cash balance is unavailable.');
 let cents=0,unset=0;
 for(const method of included){if(method.balance===null){unset++;continue;}const amount=paymentBalanceCents(method.balance);if(amount===null||!Number.isSafeInteger(cents+amount))throw new Error('Total cash could not be read.');cents+=amount;}
 return {cents:unset?null:cents,unset};
}
