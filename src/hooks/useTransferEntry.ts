import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {invalidateReports} from '../lib/reportCache';
import {canonicalTransferCommand,decodeTransfer,type TransferCommand} from '../domain/transferEntry';
import {isUuid} from '../../supabase/functions/ocr/shared';
export async function transferStatus(id:string,owner:string,requestId?:string){
 const r=await supabase.rpc('transfer_entry_status',{p_id:id,p_request:requestId??null});
 if(r.error||r.data?.owner!==owner||r.data.id!==id||!['saved','removed','not_found'].includes(r.data.state))throw new Error('Could not confirm whether the transfer saved. Retry the same request.');
 return {state:r.data.state as 'saved'|'removed'|'not_found',requestCommitted:r.data.requestCommitted===true,transfer:r.data.state==='saved'?decodeTransfer(r.data.transfer,owner,id):null};
}
export function useTransferEntry(id:string){
 const owner=usePreferencesStore(s=>s.profile?.user_id);
 return useQuery({queryKey:['transferEntry',owner,id],enabled:!!owner&&isUuid(id),queryFn:()=>transferStatus(id,owner!)});
}
export function useTransferCommand(){
 const client=useQueryClient();
 return useMutation({mutationFn:async(input:TransferCommand)=>{
  const p=usePreferencesStore.getState().profile;if(!p)throw new Error('Sign in again.');
  const supported=client.getQueriesData<{owner:string;timezone:string;transferEntryVersion?:number}>({queryKey:['paymentMethods']}).some(([,d])=>d?.owner===p.user_id&&d.timezone===p.timezone&&d.transferEntryVersion===1);
  if(!supported)throw new Error('Transfers need the latest server update. Refresh payment methods and retry.');
  const command=canonicalTransferCommand(input);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  let r;try{r=await supabase.rpc('save_transfer_entry',{p_transfer:{...command,payload_version:3}}).abortSignal(controller.signal);}finally{clearTimeout(timer);}
  if(r.error)throw new Error(r.error.code==='TE002'?'This transfer changed elsewhere. Reload and review your draft.':r.error.code==='TE003'||r.error.code==='23505'?'This request is already used. Check the saved entry before editing.':r.error.code==='BT001'?'Insufficient balance for the transfer and fee. Choose another source.':r.error.code==='BT002'?'Set the source balance before transferring.':r.error.code==='PGRST202'?'Transfers need the latest server update. Refresh and retry.':'Could not save the transfer. Retry this same request or check whether it saved.');
  const data=r.data;if(data?.owner!==p.user_id||data.requestId!==input.requestId||!['saved','removed'].includes(data.state)||!Number.isSafeInteger(data.committedVersion))throw new Error('The transfer response was incomplete. Retry this same request.');
  return {owner:p.user_id,state:data.state as 'saved'|'removed',transfer:data.state==='saved'?decodeTransfer(data.transfer,p.user_id,input.id):null};
 },onSuccess:({owner})=>{if(usePreferencesStore.getState().profile?.user_id!==owner)return;invalidateReports(client);for(const queryKey of [['paymentMethods'],['transferEntry'],['transactions'],['monthlyTotals'],['dashboard'],['categories'],['transaction'],['transactionItems']])void client.invalidateQueries({queryKey});}});
}
