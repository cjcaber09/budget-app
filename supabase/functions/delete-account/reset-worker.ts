import {purgeFolder} from './worker.ts';
export interface ResetJob {request_id:string;owner_id:string;state:'pending'|'completed';settle_after:string}
interface Admin {from:(name:string)=>any;rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<any>;storage:{from:(bucket:string)=>any};auth:{admin:{getUserById:(id:string)=>Promise<any>;deleteUser:(id:string,softDelete?:boolean)=>Promise<any>}}}
export async function processFinancialReset(admin:Admin,job:ResetJob):Promise<'pending'|'completed'> {
 if(job.state==='completed')return 'completed';
 const claim=await admin.rpc('claim_financial_reset',{p_request:job.request_id});
 if(claim.error)throw new Error('status_unavailable');if(typeof claim.data!=='string')return 'pending';
 const token=claim.data;
 try{
  const leases=await admin.from('account_scan_leases').select('id').eq('owner_id',job.owner_id).gt('expires_at',new Date().toISOString()).limit(1);
  if(leases.error)throw new Error('status_unavailable');
  if(leases.data?.length||Date.now()<Date.parse(job.settle_after))return 'pending';
  const user=await admin.auth.admin.getUserById(job.owner_id);
  if(user.error||user.data?.user?.id!==job.owner_id)throw new Error('account_unavailable');
  const deadline=Date.now()+45000;
  const guard=async()=>{const r=await admin.rpc('can_cleanup_financial_reset',{p_request:job.request_id,p_token:token,p_owner:job.owner_id});if(r.error)throw new Error('status_unavailable');return r.data===true;};
  for(const bucket of ['budget-tracker-ocr','budget-tracker-proofs'])await purgeFolder(admin,bucket,job.owner_id,deadline,guard);
  const completed=await admin.rpc('complete_financial_reset',{p_request:job.request_id,p_token:token});
  if(completed.error)throw new Error('cleanup_pending');
  return 'completed';
 }catch(e){
  const code=e instanceof Error?e.message:'cleanup_pending';
  await admin.from('financial_resets').update({error_code:['storage_failed','account_unavailable','status_unavailable'].includes(code)?code:'cleanup_pending'}).eq('request_id',job.request_id).eq('worker_token',token).eq('state','pending');
  return 'pending';
 }finally{await admin.from('financial_resets').update({lease_until:null,last_attempt_at:new Date().toISOString()}).eq('request_id',job.request_id).eq('worker_token',token).eq('state','pending');}
}
