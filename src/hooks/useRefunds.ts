import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {refundCents,type Refund} from '../domain/refunds';
import {centsToDecimal,decimalToCents,isUuid,isCalendarDate} from '../../supabase/functions/ocr/shared';
import {invalidateReports} from '../lib/reportCache';

export function useRefunds(expenseId:string,enabled=true) {
 const owner=usePreferencesStore(s=>s.profile?.user_id);
 return useQuery({queryKey:['refunds',owner,expenseId],enabled:enabled&&!!owner&&isUuid(expenseId),retry:false,meta:{shouldNotify:()=>false},queryFn:async({signal})=>{
  const {data,error}=await supabase.rpc('refund_snapshot',{p_expense:expenseId}).abortSignal(signal);
  if(error)throw new Error(error.code==='PGRST202'?'Refunds are not available yet.':'Could not load refunds. Retry before recording one.');
  if(data?.owner!==owner||data.expenseId!==expenseId||typeof data.expenseCreatedAt!=='string'||!Number.isFinite(Date.parse(data.expenseCreatedAt))||!Array.isArray(data.rows)||decimalToCents(data.amount)===null||decimalToCents(data.amount)!<=0||decimalToCents(data.refunded)===null||decimalToCents(data.refunded)!<0)throw new Error('Refund details could not be confirmed. Refresh and retry.');
  let total=0;const seen=new Set<string>();
  for(const r of data.rows){const cents=refundCents(r.amount);if(!isUuid(r.id)||seen.has(r.id)||r.user_id!==owner||r.expense_id!==expenseId||!isUuid(r.method_id)||cents===null||!isCalendarDate(r.refund_date)||!Number.isSafeInteger(r.version)||r.version<1)throw new Error('Refund details could not be confirmed.');seen.add(r.id);total+=cents;}
  if(!Number.isSafeInteger(total)||total!==decimalToCents(data.refunded)||total>decimalToCents(data.amount)!)throw new Error('Refund totals do not reconcile.');
  return {owner,expenseId,expenseCreatedAt:data.expenseCreatedAt as string,amount:decimalToCents(data.amount)!,refunded:total,rows:data.rows as Refund[]};
 }});
}
export interface RefundInput {id:string;expenseId:string;expenseCreatedAt:string;operation:'create'|'update'|'delete';amount?:string;methodId?:string;date?:string;note?:string;expectedVersion?:number}
export function useSaveRefund() {
 const client=useQueryClient();return useMutation({meta:{shouldNotify:()=>false},mutationFn:async(input:RefundInput)=>{
  const owner=usePreferencesStore.getState().profile?.user_id;
  if(!owner)throw new Error('Sign in again.');
  if(!isUuid(input.id)||!isUuid(input.expenseId)||typeof input.expenseCreatedAt!=='string'||!Number.isFinite(Date.parse(input.expenseCreatedAt))||input.operation!=='create'&&(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion!<1)||input.operation!=='delete'&&(!isUuid(input.methodId)||!input.date||!isCalendarDate(input.date)||refundCents(input.amount??'')===null))throw new Error('Enter a positive amount, a received date and a payment method. Refresh before editing or removing a refund.');
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
  try {
   const payload={...input,...(input.amount===undefined?{}:{amount:centsToDecimal(refundCents(input.amount)!)})};
   const {data,error}=await supabase.rpc('save_refund',{p_refund:payload}).abortSignal(controller.signal);
   if(error)throw new Error(error.code==='22023'||error.code==='40001'||error.code==='23505'?error.message:error.code==='PGRST202'?'Refunds are not available yet.':'Could not confirm the refund. Keep this draft and retry.');
   if(data?.owner!==owner||data.expenseId!==input.expenseId||data.id!==input.id||data.state!==(input.operation==='delete'?'deleted':'saved')||input.operation!=='delete'&&(data.refund?.user_id!==owner||data.refund?.id!==input.id||data.refund?.expense_id!==input.expenseId||refundCents(data.refund?.amount??'')===null)||usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('Could not confirm the refund. Keep this draft and retry.');
   return data as {owner:string;expenseId:string;id:string;state:string};
  }finally{clearTimeout(timer);}
 },onSuccess:result=>{if(usePreferencesStore.getState().profile?.user_id!==result.owner)return;invalidateReports(client);for(const queryKey of [['refunds'],['transactions'],['transaction'],['dashboard'],['monthlyTotals'],['paymentMethods'],['phoneReminders']])void client.invalidateQueries({queryKey});}});
}
