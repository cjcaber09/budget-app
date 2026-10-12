import {decimalToCents,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
export interface Refund {id:string;user_id:string;expense_id:string;method_id:string;amount:string;refund_date:string;note:string|null;version:number}
export function refundCents(value:string) {
 const amount=/^\d+(?:\.\d{0,2})?$/.test(value)?decimalToCents(value):null;
 return amount!==null&&amount>0&&amount<=MAX_MONEY_CENTS?amount:null;
}
