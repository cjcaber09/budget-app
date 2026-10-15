import {decimalToCents,isCalendarDate,isUuid,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
import {decodeTransfer} from './transferEntry';
import type {PaymentTransfer} from './paymentMethods';
import type {Transaction} from '../types/database';
export interface TransferActivity extends PaymentTransfer {row_kind:'transfer';type:'transfer';user_id:string;source_label:string;destination_label:string;financial_date:string;occurred_at:string}
export type HistoryActivity=Transaction|TransferActivity;
export interface ActivityCursor {date:string;at:string;kind:string;id:string}
export function activityKey(row:HistoryActivity){return `${row.type==='transfer'?'transfer':row.type==='refund'?'refund':'transaction'}:${row.id}`;}
export function decodeActivityPage(value:unknown,owner:string,month:string,timezone:string){
 const d=value as {owner:string;month:string;timezone:string;rows:Record<string,unknown>[];has_more:boolean;next:ActivityCursor|null};
 const fail=()=>{throw new Error('Activity history could not be read. Retry.');};
 if(!d||d.owner!==owner||d.month!==month||d.timezone!==timezone||!Array.isArray(d.rows)||d.rows.length>10||typeof d.has_more!=='boolean')return fail();
 const rows:HistoryActivity[]=d.rows.map(r=>{
  if(!r||!isUuid(r.id)||r.user_id!==owner||!isCalendarDate(r.financial_date)||r.financial_date.slice(0,7)!==month.slice(0,7)||typeof r.occurred_at!=='string'||!Number.isFinite(Date.parse(r.occurred_at)))return fail();
  if(r.row_kind==='transfer'){
   if(r.type!=='transfer'||typeof r.source_label!=='string'||typeof r.destination_label!=='string')return fail();decodeTransfer(r,owner);return r as unknown as TransferActivity;
  }
  const n=typeof r.amount==='string'?decimalToCents(r.amount):null;
  if(!['income','expense','refund'].includes(String(r.type))||r.row_kind!==(r.type==='refund'?'refund':'transaction')||(r.type==='refund'&&!isUuid(r.refund_of))||n===null||n<=0||n>MAX_MONEY_CENTS)return fail();
  return {...r,amount:n/100} as unknown as Transaction;
 });
 if(new Set(rows.map(activityKey)).size!==rows.length)return fail();
 const last=rows.at(-1),next=d.next;
 if(d.has_more){if(rows.length!==10||!next||next.date!==last?.financial_date||next.at!==last?.occurred_at||!last||`${next.kind}:${next.id}`!==activityKey(last))return fail();}
 else if(next!==null)return fail();
 return {rows,next};
}
