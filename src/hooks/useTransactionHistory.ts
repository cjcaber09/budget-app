import {useInfiniteQuery} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {decodeTransactionPage,type TransactionCursor} from '../domain/transactionPages';
import type {TransactionFilter} from '../domain/csv';

export function useTransactionHistory(month:string,filter:TransactionFilter,search:string) {
 const profile=usePreferencesStore(s=>s.profile),owner=profile?.user_id,timezone=profile?.timezone;
 const term=search.trim().toLowerCase();
 const query=useInfiniteQuery({
  queryKey:['transactions','pages',month,owner,timezone,filter,term],enabled:!!owner&&!!timezone,
  initialPageParam:null as TransactionCursor|null,
  queryFn:async({pageParam,signal})=>{
   const {data,error}=await supabase.rpc('transaction_history_page',{
    p_month:month,p_type:filter,p_search:term,
    p_before_date:pageParam?.date??null,p_before_at:pageParam?.at??null,p_before_id:pageParam?.id??null,
   }).abortSignal(signal);
   if(error)throw new Error('Could not load transactions. Retry.');
   return decodeTransactionPage(data,owner!,month,timezone!);
  },
  getNextPageParam:last=>last.next??undefined,
 });
 const rows=query.data?.pages.flatMap(page=>page.rows);
 const seen=new Set<string>();
 return {...query,data:rows?.filter(row=>{if(seen.has(row.id))return false;seen.add(row.id);return true;})};
}
