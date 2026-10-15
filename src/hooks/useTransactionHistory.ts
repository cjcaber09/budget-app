import {useInfiniteQuery} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {decodeTransactionPage,type TransactionCursor} from '../domain/transactionPages';
import type {TransactionFilter} from '../domain/csv';
import {usePaymentMethods} from './usePaymentMethods';
import {decodeActivityPage,activityKey,type ActivityCursor,type HistoryActivity} from '../domain/activityPages';

export function useTransactionHistory(month:string,filter:TransactionFilter,search:string) {
 const profile=usePreferencesStore(s=>s.profile),owner=profile?.user_id,timezone=profile?.timezone;
 const term=search.trim().toLowerCase();
 const methods=usePaymentMethods(),combined=methods.transferEntrySupported;
 const query=useInfiniteQuery({
  queryKey:['transactions','pages',month,owner,timezone,filter,term,combined?'activity-v1':'legacy'],enabled:!!owner&&!!timezone&&(filter!=='transfer'||combined),
  initialPageParam:null as (TransactionCursor&{kind?:string})|null,
  queryFn:async({pageParam,signal})=>{
   const {data,error}=await supabase.rpc(combined?'activity_history_page':'transaction_history_page',{
    p_month:month,p_type:filter,p_search:term,
    p_before_date:pageParam?.date??null,p_before_at:pageParam?.at??null,p_before_id:pageParam?.id??null,
    ...(combined?{p_before_kind:pageParam?.kind??null}:{}),
   }).abortSignal(signal);
   if(error)throw new Error('Could not load transactions. Retry.');
   return combined?decodeActivityPage(data,owner!,month,timezone!):decodeTransactionPage(data,owner!,month,timezone!);
  },
  getNextPageParam:last=>(last.next as ActivityCursor|null)??undefined,
 });
 const rows=query.data?.pages.flatMap(page=>page.rows as HistoryActivity[]);
 const seen=new Set<string>();
 return {...query,data:rows?.filter(row=>{const key=activityKey(row);if(seen.has(key))return false;seen.add(key);return true;})};
}
