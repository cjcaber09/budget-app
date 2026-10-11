import {createClient} from '@supabase/supabase-js';
import {processFinancialReset,type ResetJob} from './reset-worker.ts';
interface Input {admin:any;url:string;anonKey:string;token:string;owner:string;body:Record<string,unknown>;response:(status:number,body:Record<string,unknown>)=>Response}
export async function handleFinancialReset({admin,url,anonKey,token,owner,body,response}:Input):Promise<Response>{
 const user=await admin.auth.getUser(token);
 if(user.error||user.data.user?.id!==owner)return response(401,{error:'unauthorized'});
 const result=await admin.from('financial_resets').select('*').eq('owner_id',owner).eq('request_id',body.requestId).maybeSingle();
 if(result.error)return response(503,{error:'status_unavailable'});
 let job=result.data as ResetJob|null;
 if(body.action!=='reset'&&!job)return response(404,{error:'operation_not_found'});
 if(!job){
  if(!user.data.user?.email)return response(401,{error:'unauthorized'});
  if(typeof body.password!=='string'||!body.password||body.password.length>1024)return response(400,{error:'invalid_request'});
  const isolated=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
   const verified=await isolated.auth.signInWithPassword({email:user.data.user.email,password:body.password});
   if(verified.error||verified.data.user?.id!==owner)return response(403,{error:'password_not_accepted'});
   const begun=await admin.rpc('begin_financial_reset',{p_owner:owner,p_request:body.requestId});
   if(begun.error||!begun.data)return response(503,{error:'status_unavailable'});
   job=begun.data as ResetJob;
  }finally{await isolated.auth.signOut({scope:'local'}).catch(()=>{});}
 }
 if(job!.request_id!==body.requestId)return response(409,{error:'operation_exists',requestId:job!.request_id,state:job!.state});
 const state=await processFinancialReset(admin,job!);
 return response(state==='completed'?200:202,{requestId:job!.request_id,state});
}
