import {decimalToCents} from '../../supabase/functions/ocr/shared';
import {isCreditCard,type PaymentMethod} from './paymentMethods';
import {localDateKey} from './transactionDates';
import type {Transaction} from '../types/database';

export function expenseFundsWarning(input: {type: string; amount: number; paymentMethodId?: string|null}, methods: PaymentMethod[]|undefined,
 previous?: Transaction, timezone='UTC', today=localDateKey(new Date(),timezone)): string|null {
 if(input.type!=='expense')return null;
 const method=methods?.find(m=>input.paymentMethodId?m.id===input.paymentMethodId:m.method==='cash');
 if(!method)return 'The tracked balance could not be checked. Record this only if the expense has already been paid.';
 if(isCreditCard(method))return null;
 if(method.balance===null||method.baseline_at===null)return 'Balance not set. You can still record an expense that has already been paid.';
 const available=decimalToCents(method.balance);
 if(available===null)return 'The tracked balance could not be checked. Record this only if the expense has already been paid.';
 let required=decimalToCents(input.amount)!;
 if(previous && (previous.payment_method_id===method.id||(!previous.payment_method_id&&method.method==='cash'))){
  const day=previous.transaction_date ?? localDateKey(new Date(previous.occurred_at),timezone);
  const assigned=(previous as Transaction & {payment_assigned_at?:string}).payment_assigned_at;
  if(day<=today && ((assigned&&Date.parse(assigned)>=Date.parse(method.baseline_at))||day>localDateKey(new Date(method.baseline_at),timezone))) {
   required+=(previous.type==='expense'?-1:1)*decimalToCents(previous.amount)!;
  }
 }
 return required>0&&required>available?'This expense exceeds the tracked balance. A missing income entry or balance correction may explain the difference. Record it only if it has already been paid.':null;
}
