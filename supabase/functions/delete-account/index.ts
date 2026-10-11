import {createClient} from '@supabase/supabase-js';
import {corsHeaders} from '@supabase/supabase-js/cors';
import {createRemoteJWKSet,jwtVerify,decodeProtectedHeader} from 'jose';
import {isUuid,timingSafeEqual} from '../ocr/shared.ts';
import {processDeletion,type DeletionJob} from './worker.ts';

const url=Deno.env.get('SUPABASE_URL')!,serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,anonKey=Deno.env.get('SUPABASE_ANON_KEY')!;
const admin=createClient(url,serviceKey,{db:{schema:'budget_tracker'},auth:{persistSession:false,autoRefreshToken:false}});
const jwks=createRemoteJWKSet(new URL(`${url}/auth/v1/.well-known/jwks.json`));
const response=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});
async function verifiedOwner(token:string):Promise<string> {
 const header=decodeProtectedHeader(token);
 const secret=Deno.env.get('ACCOUNT_DELETION_JWT_SECRET');
 if(header.alg==='HS256'&&!secret){
  const verified=await admin.auth.getUser(token);if(!verified.error&&verified.data.user)return verified.data.user.id;
  // Legacy JWT signature verification is delegated to PostgREST, not an unsigned decode.
  const scoped=createClient(url,anonKey,{db:{schema:'budget_tracker'},global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
  const status=await scoped.rpc('account_deletion_status');
  if(status.error||!isUuid(status.data?.owner))throw new Error('unauthorized');return status.data.owner;
 }
 const options={issuer:`${url}/auth/v1`,audience:'authenticated',algorithms:['HS256','ES256','RS256']};
 const verified=header.alg==='HS256'?await jwtVerify(token,new TextEncoder().encode(secret!),options):await jwtVerify(token,jwks,options);
 if(!isUuid(verified.payload.sub)||verified.payload.role!=='authenticated')throw new Error('unauthorized');return verified.payload.sub;
}
async function handle(req:Request):Promise<Response>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
 if(req.method!=='POST')return response(405,{error:'method_not_allowed'});
 if(Number(req.headers.get('content-length')??0)>4096)return response(413,{error:'invalid_request'});
 let body:Record<string,unknown>;
 try{const text=await req.text();if(text.length>4096)return response(413,{error:'invalid_request'});body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('invalid_request');}catch{return response(400,{error:'invalid_request'});}
 const supplied=req.headers.get('x-ocr-webhook-secret');
 if(supplied!==null){
  const secret=Deno.env.get('OCR_WEBHOOK_SECRET');
  if(!secret||!timingSafeEqual(supplied,secret)||body.action!=='worker')return response(401,{error:'unauthorized'});
  const started=new Date().toISOString();
  const pending=await admin.from('account_deletions').select('*').order('last_attempt_at').limit(20);
  if(pending.error)return response(503,{error:'status_unavailable'});
  for(const job of pending.data??[]){if(Date.now()-Date.parse(started)>50000)break;await processDeletion(admin,job as DeletionJob);}
  // Completed records survive for status recovery, then are minimized after a final sweep.
  const cutoff=new Date(Date.now()-86400000).toISOString();
  await admin.from('account_deletions').delete().eq('state','completed').lt('completed_at',cutoff).gte('last_attempt_at',started).is('error_code',null);
  await admin.from('account_scan_leases').delete().lt('expires_at',new Date().toISOString());
  return response(200,{ok:true});
 }
 const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return response(401,{error:'unauthorized'});
 let owner:string;try{owner=await verifiedOwner(token);}catch{return response(401,{error:'unauthorized'});}
 if(!isUuid(body.requestId)||!['delete','status','resume'].includes(String(body.action)))return response(400,{error:'invalid_request'});
 const lookup=await admin.from('account_deletions').select('*').eq('owner_id',owner).maybeSingle();
 if(lookup.error)return response(503,{error:'status_unavailable'});
 let job=lookup.data as DeletionJob|null;
 if(body.action==='status'){
  if(!job)return response(404,{error:'operation_not_found'});
  if(job.request_id!==body.requestId)return response(403,{error:'operation_unavailable'});
 }else if(!job){
  const verified=await admin.auth.getUser(token);if(verified.error||!verified.data.user?.email||verified.data.user.id!==owner)return response(401,{error:'unauthorized'});
  if(typeof body.password!=='string'||!body.password||body.password.length>1024)return response(400,{error:'invalid_request'});
  const isolated=createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  try{
   const credentials=await isolated.auth.signInWithPassword({email:verified.data.user.email,password:body.password});
   if(credentials.error||credentials.data.user?.id!==owner)return response(403,{error:'password_not_accepted'});
   const begun=await admin.rpc('begin_account_deletion',{p_owner:owner,p_request:body.requestId});
   if(begun.error||!begun.data)return response(503,{error:'status_unavailable'});job=begun.data as DeletionJob;
  }finally{await isolated.auth.signOut({scope:'local'}).catch(()=>{});}
 }else if(job.request_id!==body.requestId){
  // Same owner may resume an operation after reopening Settings; never target another owner.
  return response(409,{error:'operation_exists',requestId:job.request_id,state:job.state});
 }
 const state=await processDeletion(admin,job!);
 return response(state==='completed'?200:202,{requestId:job!.request_id,state});
}
Deno.serve(req=>handle(req).catch(()=>response(503,{error:'status_unavailable'})));
