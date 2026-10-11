export interface DeletionJob {request_id:string;owner_id:string;state:'pending'|'completed';settle_after:string;completed_at?:string|null}

// Runtime SDK is supplied by the authenticated handler; this module is testable in Jest.
interface Admin {
 from:(name:string)=>any;
 storage:{from:(bucket:string)=>any};
 auth:{admin:{getUserById:(id:string)=>Promise<any>;deleteUser:(id:string,softDelete?:boolean)=>Promise<any>}};
 rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<any>;
}
async function purgeFolder(admin:Admin,bucket:string,path:string,deadline:number):Promise<void> {
 const storage=admin.storage.from(bucket);
 for(let pass=0;pass<100;pass++){
  if(Date.now()>deadline)throw new Error('cleanup_pending');
  const listed=await storage.list(path,{limit:100,sortBy:{column:'name',order:'asc'}});
  if(listed.error||!Array.isArray(listed.data))throw new Error('storage_failed');
  if(!listed.data.length)return;
  const objects:string[]=[];
  for(const file of listed.data){
   if(typeof file.name!=='string'||file.name.includes('/')||file.name==='.'||file.name==='..')throw new Error('storage_failed');
   if(file.id===null)await purgeFolder(admin,bucket,`${path}/${file.name}`,deadline);else objects.push(`${path}/${file.name}`);
  }
  if(objects.length){const removed=await storage.remove(objects);if(removed.error)throw new Error('storage_failed');}
 }
 throw new Error('cleanup_pending');
}
export async function processDeletion(admin:Admin,job:DeletionJob):Promise<'pending'|'completed'> {
 const claimed=await admin.rpc('claim_account_deletion',{p_request:job.request_id});
 if(claimed.error)throw new Error('status_unavailable');
 if(!claimed.data)return job.state;
 const deadline=Date.now()+45000;
 try{
  const scans=await admin.from('account_scan_leases').select('id').eq('owner_id',job.owner_id).gt('expires_at',new Date().toISOString()).limit(1);
  if(scans.error)throw new Error('status_unavailable');
  if(scans.data?.length||Date.now()<Date.parse(job.settle_after))return job.state;
  for(const bucket of ['budget-tracker-ocr','budget-tracker-avatars'])await purgeFolder(admin,bucket,job.owner_id,deadline);
  const lookup=await admin.auth.admin.getUserById(job.owner_id);
  if(lookup.error&&lookup.error.code!=='user_not_found')throw new Error('lookup_failed');
  if(!lookup.error&&!lookup.data?.user)throw new Error('lookup_failed');
  if(lookup.data?.user){const removed=await admin.auth.admin.deleteUser(job.owner_id,false);if(removed.error)throw new Error('delete_failed');}
  // Sweep a second time after cascades; completed jobs are swept again for 24 hours.
  for(const bucket of ['budget-tracker-ocr','budget-tracker-avatars'])await purgeFolder(admin,bucket,job.owner_id,deadline);
  const checked=await admin.auth.admin.getUserById(job.owner_id);
  if(checked.error?.code!=='user_not_found')throw new Error('lookup_failed');
  const updated=await admin.from('account_deletions').update({state:'completed',completed_at:job.completed_at??new Date().toISOString(),error_code:null}).eq('request_id',job.request_id);
  if(updated.error)throw new Error('status_unavailable');
  return 'completed';
 }catch(e){
  const code=e instanceof Error?e.message:'cleanup_pending';
  await admin.from('account_deletions').update({error_code:['storage_failed','lookup_failed','delete_failed','status_unavailable'].includes(code)?code:'cleanup_pending'}).eq('request_id',job.request_id);
  return 'pending';
 }finally{await admin.from('account_deletions').update({lease_until:null,last_attempt_at:new Date().toISOString()}).eq('request_id',job.request_id);}
}
