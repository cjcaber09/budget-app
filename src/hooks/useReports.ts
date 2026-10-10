import {useEffect,useState} from 'react';
import {AppState} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {localDateKey} from '../domain/transactionDates';
import {decodeReportSnapshot,reportingMonthSupported,reportCents} from '../domain/reports';
import {isUuid,isCalendarDate,MAX_MONEY_CENTS} from '../../supabase/functions/ocr/shared';
export function useReports(month:string) {
 const profile=usePreferencesStore(s=>s.profile);
 const [clock,setClock]=useState(()=>Date.now());
 const today=localDateKey(new Date(clock),profile?.timezone);
 const supported=reportingMonthSupported(month,today);
 const query=useQuery({queryKey:['reports',profile?.user_id,month,profile?.timezone,today],enabled:!!profile&&supported,refetchOnMount:'always',queryFn:async({signal})=>{
  const r=await supabase.rpc('reporting_snapshot',{p_month:month}).abortSignal(signal);
  if(r.error)throw new Error('Could not load reports. Retry to refresh your transactions and bills.');
  return decodeReportSnapshot(r.data,{owner:profile!.user_id,month,timezone:profile!.timezone,today});
 }});
 const refetch=query.refetch;
 useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),30000);const l=AppState.addEventListener('change',s=>{if(s==='active'){setClock(Date.now());if(supported)void refetch();}});return()=>{clearInterval(timer);l.remove();};},[refetch,supported]);
 return {...query,supported,today};
}
export interface ReportTransfer {id:string;transfer_date:string;amount:number;source_id:string;destination_id:string;source_name:string;destination_name:string;note:string|null}
function historyEnvelope(raw:unknown,owner:string,month:string,timezone:string) {
 const r=raw as {owner?:string;month?:string;timezone?:string;rows?:unknown[]};
 if(!r||r.owner!==owner||r.month!==month||r.timezone!==timezone||!Array.isArray(r.rows))throw new Error('History context changed. Retry to refresh.');
 return r.rows;
}
function historyRow(value:unknown):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('History row could not be read. Retry to refresh.');
 return value as Record<string,unknown>;
}
function historyId(value:unknown,nullable=false) {if(nullable&&value===null)return;if(!isUuid(value))throw new Error('History identifier could not be read.');}
function historyDate(value:unknown,month:string) {if(!isCalendarDate(value)||value.slice(0,7)!==month.slice(0,7))throw new Error('History date could not be read.');}
function historyText(value:unknown,nullable=false) {if(nullable&&value===null)return;if(typeof value!=='string')throw new Error('History text could not be read.');}
export function useReportTransfers(month:string,enabled=true) {
 const p=usePreferencesStore(s=>s.profile);const supported=reportingMonthSupported(month,localDateKey(new Date(),p?.timezone));
 return useQuery({queryKey:['reportTransfers',p?.user_id,month,p?.timezone],enabled:enabled&&!!p&&supported,queryFn:async({signal}):Promise<ReportTransfer[]>=>{
  const r=await supabase.rpc('report_transfer_history',{p_month:month}).abortSignal(signal);
  if(r.error)throw new Error('Could not load transfers. Retry to refresh.');
  return historyEnvelope(r.data,p!.user_id,month,p!.timezone).map(value=>{const v=historyRow(value);historyId(v.id);historyId(v.source_id);historyId(v.destination_id);historyDate(v.transfer_date,month);historyText(v.source_name);historyText(v.destination_name);historyText(v.note,true);const amount=reportCents(v.amount);if(amount<=0)throw new Error('Transfer amount could not be read.');return {...v,amount} as unknown as ReportTransfer;});
 }});
}
export function useReportTransactions(month:string,enabled=true) {
 const p=usePreferencesStore(s=>s.profile);const supported=reportingMonthSupported(month,localDateKey(new Date(),p?.timezone));
 return useQuery({queryKey:['reportTransactions',p?.user_id,month,p?.timezone],enabled:enabled&&!!p&&supported,queryFn:async({signal}):Promise<import('../types/database').Transaction[]>=>{
  const r=await supabase.rpc('report_transaction_history',{p_month:month}).abortSignal(signal);
  if(r.error)throw new Error('Could not load history. Retry to refresh.');
  return historyEnvelope(r.data,p!.user_id,month,p!.timezone).map(value=>{const v=historyRow(value);if(v.user_id!==p!.user_id)throw new Error('History ownership changed. Retry to refresh.');historyId(v.id);historyId(v.category_id,true);historyId(v.income_source_id,true);historyId(v.payment_method_id,true);historyDate(v.financial_date,month);historyText(v.note,true);historyText(v.payment_method_kind);if(v.type!=='income'&&v.type!=='expense'||typeof v.occurred_at!=='string'||!Number.isFinite(Date.parse(v.occurred_at)))throw new Error('Transaction history could not be read.');const cents=reportCents(v.amount);if(cents<=0||cents>MAX_MONEY_CENTS)throw new Error('Transaction amount could not be read.');return {...v,amount:cents/100} as unknown as import('../types/database').Transaction;});
 }});
}
