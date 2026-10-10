import {supabase} from './supabase';
import {useAccountDeletionStore,type PendingDeletion} from '../stores/useAccountDeletionStore';

export class DeletionError extends Error {constructor(public code:string){super(code);}}
export async function deletionRequest(operation:PendingDeletion,action:'delete'|'status'|'resume',password?:string) {
 const session=await supabase.auth.getSession();
 if(session.error||session.data.session?.user.id!==operation.owner)throw new DeletionError('unauthorized');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
 try{
  const response=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,{
   method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,Authorization:`Bearer ${session.data.session.access_token}`},
   body:JSON.stringify({action,requestId:operation.requestId,...(password===undefined?{}:{password})}),signal:controller.signal,
  });
  const data=await response.json();
  if(response.status===409&&data.error==='operation_exists'&&typeof data.requestId==='string'){
   await useAccountDeletionStore.getState().set({...operation,requestId:data.requestId,accepted:true});return 'pending' as const;
  }
  if(!response.ok)throw new DeletionError(typeof data.error==='string'?data.error:'status_unavailable');
  if(data.requestId!==operation.requestId||!['pending','completed'].includes(data.state))throw new DeletionError('status_unavailable');
  if(data.state==='pending')await useAccountDeletionStore.getState().set({...operation,accepted:true});
  return data.state as 'pending'|'completed';
 }finally{clearTimeout(timer);}
}
