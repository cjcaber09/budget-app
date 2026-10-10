import { decimalToCents, isCalendarDate, isUuid, MAX_MONEY_CENTS } from '../../supabase/functions/ocr/shared';
import type { Transaction } from '../types/database';

export interface TransactionCursor { date: string; at: string; id: string }
export interface TransactionPage { rows: Transaction[]; next: TransactionCursor | null }
export function decodeTransactionPage(value: unknown, owner: string, month: string, timezone: string): TransactionPage {
  const data=value as Record<string,unknown>|null;
  const fail=()=>{throw new Error('Transaction history could not be read. Retry.');};
  if(!data||data.owner!==owner||data.month!==month||data.timezone!==timezone||!Array.isArray(data.rows)||data.rows.length>10||typeof data.has_more!=='boolean')return fail();
  const rows:Transaction[]=data.rows.map((value:unknown)=>{
    const row=value as Transaction & {amount:unknown};
    const cents=typeof row?.amount==='string'?decimalToCents(row.amount):null;
    if(!row||!isUuid(row.id)||row.user_id!==owner||!isCalendarDate(row.financial_date)||row.financial_date!.slice(0,7)!==month.slice(0,7)||!Number.isFinite(Date.parse(row.occurred_at))||!['income','expense'].includes(row.type)||cents===null||cents<=0||cents>MAX_MONEY_CENTS)return fail();
    return {...row,amount:cents/100};
  });
  if(new Set(rows.map(row=>row.id)).size!==rows.length)return fail();
  if(!data.has_more){if(data.next!==null)return fail();return {rows,next:null};}
  const next=data.next as TransactionCursor|null,last=rows.at(-1);
  if(rows.length!==10||!next||next.date!==last?.financial_date||next.at!==last?.occurred_at||next.id!==last?.id)return fail();
  return {rows,next};
}
