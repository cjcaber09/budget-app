import {processDeletion,cleanupAttachments} from '../../supabase/functions/delete-account/worker';
const job={request_id:'request',owner_id:'owner',state:'pending' as const,settle_after:'2020-01-01T00:00:00Z'};
function fixture({scans=false,storageError=false,lookupError=false,proofError=false}={}){
 let exists=true;const updates:any[]=[];
 const chain:any={select:()=>chain,eq:()=>chain,gt:()=>chain,limit:async()=>({data:scans?[{id:'scan'}]:[],error:null}),update:(data:any)=>{updates.push(data);return chain;},then:(resolve:any)=>resolve({error:null})};
 const remove=jest.fn().mockResolvedValue({error:null}),deleteUser=jest.fn().mockImplementation(async()=>{exists=false;return {error:null};});
 const admin:any={rpc:jest.fn().mockResolvedValue({data:true,error:null}),from:()=>chain,storage:{from:jest.fn(bucket=>({list:async()=>({data:[],error:storageError||(proofError&&bucket==='budget-tracker-proofs')?{}:null}),remove}))},auth:{admin:{getUserById:async()=>lookupError?{error:{code:'unexpected_failure'}}:exists?{data:{user:{id:'owner'}},error:null}:{data:{user:null},error:{code:'user_not_found'}},deleteUser}}};
 return {admin,deleteUser,updates};
}
test('in-flight scan defers irreversible deletion',async()=>{const f=fixture({scans:true});expect(await processDeletion(f.admin,job)).toBe('pending');expect(f.deleteUser).not.toHaveBeenCalled();});
test('storage or ambiguous auth lookup failure never deletes the account or confirms completion',async()=>{for(const options of [{storageError:true},{lookupError:true}]){const f=fixture(options);expect(await processDeletion(f.admin,job)).toBe('pending');expect(f.deleteUser).not.toHaveBeenCalled();expect(f.updates.some(r=>r.state==='completed')).toBe(false);}});
test('completion is persisted only after definite Auth absence and empty storage',async()=>{const f=fixture();expect(await processDeletion(f.admin,job)).toBe('completed');expect(f.deleteUser).toHaveBeenCalledWith('owner',false);expect(f.updates).toEqual(expect.arrayContaining([expect.objectContaining({state:'completed'}),expect.objectContaining({lease_until:null})]));});
test('proof storage is swept before and after deletion and its failures keep the job pending',async()=>{
 const f=fixture();await processDeletion(f.admin,job);expect(f.admin.storage.from.mock.calls.filter(([bucket]:string[])=>bucket==='budget-tracker-proofs')).toHaveLength(2);
 const failed=fixture({proofError:true});expect(await processDeletion(failed.admin,job)).toBe('pending');expect(failed.deleteUser).not.toHaveBeenCalled();
});
test('attachment cleanup uses Storage API and preserves a failed job for retry',async()=>{
 const f=fixture();f.admin.rpc.mockResolvedValue({data:[{object_path:'owner/transaction/file.webp'}],error:null});
 f.admin.storage.from.mockReturnValue({remove:jest.fn().mockResolvedValue({error:{}})});await cleanupAttachments(f.admin);expect(f.updates).toEqual([]);
 f.admin.storage.from.mockReturnValue({remove:jest.fn().mockResolvedValue({error:null})});await cleanupAttachments(f.admin);expect(f.updates).toEqual([expect.objectContaining({completed_at:expect.any(String)})]);
});
