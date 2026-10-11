import {processDeletion} from '../../supabase/functions/delete-account/worker';
const job={request_id:'request',owner_id:'owner',state:'pending' as const,settle_after:'2020-01-01T00:00:00Z'};
function fixture({scans=false,storageError=false,lookupError=false}={}){
 let exists=true;const updates:any[]=[];
 const chain:any={select:()=>chain,eq:()=>chain,gt:()=>chain,limit:async()=>({data:scans?[{id:'scan'}]:[],error:null}),update:(data:any)=>{updates.push(data);return chain;},then:(resolve:any)=>resolve({error:null})};
 const remove=jest.fn().mockResolvedValue({error:null}),deleteUser=jest.fn().mockImplementation(async()=>{exists=false;return {error:null};});
 const admin:any={rpc:jest.fn().mockResolvedValue({data:true,error:null}),from:()=>chain,storage:{from:()=>({list:async()=>({data:[],error:storageError?{}:null}),remove})},auth:{admin:{getUserById:async()=>lookupError?{error:{code:'unexpected_failure'}}:exists?{data:{user:{id:'owner'}},error:null}:{data:{user:null},error:{code:'user_not_found'}},deleteUser}}};
 return {admin,deleteUser,updates};
}
test('in-flight scan defers irreversible deletion',async()=>{const f=fixture({scans:true});expect(await processDeletion(f.admin,job)).toBe('pending');expect(f.deleteUser).not.toHaveBeenCalled();});
test('storage or ambiguous auth lookup failure never deletes the account or confirms completion',async()=>{for(const options of [{storageError:true},{lookupError:true}]){const f=fixture(options);expect(await processDeletion(f.admin,job)).toBe('pending');expect(f.deleteUser).not.toHaveBeenCalled();expect(f.updates.some(r=>r.state==='completed')).toBe(false);}});
test('completion is persisted only after definite Auth absence and empty storage',async()=>{const f=fixture();expect(await processDeletion(f.admin,job)).toBe('completed');expect(f.deleteUser).toHaveBeenCalledWith('owner',false);expect(f.updates).toEqual(expect.arrayContaining([expect.objectContaining({state:'completed'}),expect.objectContaining({lease_until:null})]));});
