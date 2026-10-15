import type {Transaction} from '../types/database';
import {paymentBalanceCents,type PaymentMethod,type BalanceCorrection} from './paymentMethods';
import type {ReportTransfer} from '../hooks/useReports';
import {decimalToCents,isCalendarDate} from '../../supabase/functions/ocr/shared';
import {effectiveDate,localDateKey} from './transactionDates';

export interface AccountActivityRow {key:string;kind:'transaction'|'transfer'|'correction';label:string;date:string;cents:number;note:string;detail:string}
export function accountActivity(method:PaymentMethod,month:string,timezone:string,transactions:Transaction[],transfers:ReportTransfer[],corrections:BalanceCorrection[]):AccountActivityRow[] {
 const rows:AccountActivityRow[]=[];
 const inMonth=(day:string)=>isCalendarDate(day)&&day.slice(0,7)===month.slice(0,7);
 for(const row of transactions){
  if(row.user_id!==method.user_id||!(row.payment_method_id===method.id||(method.method==='cash'&&!row.payment_method_id)))continue;
  const date=effectiveDate(row);if(!inMonth(date))continue;
  const amount=decimalToCents(row.amount);if(amount===null||amount<=0)throw new Error('An activity amount could not be read. Refresh and retry.');
  rows.push({key:'transaction:'+row.id,kind:'transaction',date,cents:row.type==='expense'?-amount:amount,label:row.type==='refund'?'Refund':row.transfer_id?'Transfer fee':row.type==='income'?'Income':'Expense',note:row.note??'',detail:row.type==='refund'?'Money returned from a purchase':row.occurrence_id?'Recorded bill payment':''});
 }
 for(const row of transfers){
  if(!inMonth(row.transfer_date)||method.id!==row.source_id&&method.id!==row.destination_id)continue;
  if(!Number.isSafeInteger(row.amount)||row.amount<=0)throw new Error('A transfer amount could not be read. Refresh and retry.');
  const outgoing=method.id===row.source_id;
  rows.push({key:'transfer:'+row.id,kind:'transfer',date:row.transfer_date,cents:outgoing?-row.amount:row.amount,label:outgoing?'Transfer out':'Transfer in',note:row.note??'',detail:(outgoing?'To '+row.destination_name:'From '+row.source_name)+(outgoing&&row.fee_amount>0?' · Fee listed separately':'')});
 }
 for(const row of corrections){
  if(row.method_id!==method.id)continue;
  if(!Number.isFinite(Date.parse(row.created_at)))throw new Error('A correction date could not be read. Refresh and retry.');
  const date=localDateKey(new Date(row.created_at),timezone);if(!inMonth(date))continue;
  const cents=paymentBalanceCents(row.delta);if(cents===null)throw new Error('A correction amount could not be read. Refresh and retry.');
  rows.push({key:'correction:'+row.id,kind:'correction',date,cents,label:'Balance correction',note:row.note??'',detail:'Excluded from income and spending'});
 }
 return rows.sort((a,b)=>b.date.localeCompare(a.date)||a.key.localeCompare(b.key));
}
export function searchAccountActivity(rows:AccountActivityRow[],search:string,kind:'all'|AccountActivityRow['kind']) {
 const terms=search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return rows.filter(row=>(kind==='all'||row.kind===kind)&&terms.every(term=>(row.label+' '+row.date+' '+row.note+' '+row.detail+' '+(row.cents/100).toFixed(2)).toLocaleLowerCase().includes(term)));
}
