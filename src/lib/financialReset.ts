import {supabase} from './supabase';
import {useFinancialResetStore,type PendingReset} from '../stores/useFinancialResetStore';
import {isUuid} from '../../supabase/functions/ocr/shared';
export class FinancialResetError extends Error {constructor(public code:string){super(code);}}
export async function financialResetRequest(operation:PendingReset,action:'reset'|'reset-status',password?:string):Promise<'pending'|'completed'> {
 const session=await supabase.auth.getSession();
 if(session.error||session.data.session?.user.id!==operation.owner)throw new FinancialResetError('unauthorized');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),55000);
 try{
  const r=await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`,{method:'POST',headers:{'Content-Type':'application/json',apikey:process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,Authorization:`Bearer ${session.data.session.access_token}`},body:JSON.stringify({action,requestId:operation.requestId,...(password===undefined?{}:{password})}),signal:controller.signal});
  const data=await r.json();
  const current=()=>{const pending=useFinancialResetStore.getState().pending;return pending?.owner===operation.owner&&pending.requestId===operation.requestId;};
  if(r.status===409&&data.error==='operation_exists'&&isUuid(data.requestId)){if(current())await useFinancialResetStore.getState().set({...operation,requestId:data.requestId,accepted:true});return 'pending';}
  if(!r.ok)throw new FinancialResetError(typeof data.error==='string'?data.error:'status_unavailable');
  if(data.requestId!==operation.requestId||!['pending','completed'].includes(data.state))throw new FinancialResetError('status_unavailable');
  if(data.state==='pending'&&current())await useFinancialResetStore.getState().set({...operation,accepted:true});
  return data.state;
 }finally{clearTimeout(timer);}
}
