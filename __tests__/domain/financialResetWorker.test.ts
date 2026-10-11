const {processFinancialReset}=require('../../supabase/functions/delete-account/reset-worker');
const job={request_id:'request',owner_id:'owner',state:'pending',settle_after:'2020-01-01T00:00:00Z'};
const token='00000000-0000-4000-8000-000000000003';
function fixture({lease=false,storageError=false,userMissing=false,completeError=false}={}){
 const updates:unknown[]=[];const chain:any={select:()=>chain,eq:()=>chain,gt:()=>chain,limit:async()=>({data:lease?[{id:'lease'}]:[],error:null}),update:(value:unknown)=>{updates.push(value);return chain;},then:(resolve:any)=>resolve({error:null})};
 const rpc=jest.fn(async(name:string)=>({data:name==='claim_financial_reset'?token:true,error:name==='complete_financial_reset'&&completeError?{}:null}));
 const storage=jest.fn((_bucket:string)=>({list:async()=>({data:[],error:storageError?{}:null}),remove:jest.fn().mockResolvedValue({error:null})}));
 const deleteUser=jest.fn();const admin={rpc,from:()=>chain,storage:{from:storage},auth:{admin:{getUserById:async()=>userMissing?{error:{code:'user_not_found'}}:{data:{user:{id:'owner'}},error:null},deleteUser}}};return {admin,rpc,storage,deleteUser,updates};
}
it('waits for leases and settling before any file removal or record reset',async()=>{
 const f=fixture({lease:true});expect(await processFinancialReset(f.admin,job)).toBe('pending');expect(f.storage).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalledWith('complete_financial_reset',expect.anything());
 const later=fixture();await processFinancialReset(later.admin,{...job,settle_after:'2099-01-01T00:00:00Z'});expect(later.storage).not.toHaveBeenCalled();
});
it('cleans OCR/proof storage but preserves avatars and never deletes Auth',async()=>{
 const f=fixture();expect(await processFinancialReset(f.admin,job)).toBe('completed');expect(f.storage.mock.calls.map(([bucket])=>bucket)).toEqual(['budget-tracker-ocr','budget-tracker-proofs']);expect(f.deleteUser).not.toHaveBeenCalled();expect(f.rpc).toHaveBeenCalledWith('complete_financial_reset',{p_request:'request',p_token:token});
});
it('rechecks the worker lease after listing so a stale cleanup cannot remove future receipts',async()=>{
 const f=fixture(),remove=jest.fn().mockResolvedValue({error:null}),list=jest.fn().mockResolvedValue({data:[{id:'new-object',name:'receipt.webp'}],error:null});let checked=0;
 f.storage.mockReturnValue({list,remove});f.rpc.mockImplementation(async(name)=>({data:name==='claim_financial_reset'?token:name==='can_cleanup_financial_reset'?checked++===0:true,error:null}));
 expect(await processFinancialReset(f.admin,job)).toBe('pending');expect(remove).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalledWith('complete_financial_reset',expect.anything());
});
it('storage, missing Auth or SQL failure cannot report a successful reset',async()=>{
 for(const options of [{storageError:true},{userMissing:true},{completeError:true}]){const f=fixture(options);expect(await processFinancialReset(f.admin,job)).toBe('pending');expect(f.deleteUser).not.toHaveBeenCalled();}
});
it('a completed retry cannot erase files or newly recorded data',async()=>{
 const f=fixture();expect(await processFinancialReset(f.admin,{...job,state:'completed'})).toBe('completed');expect(f.rpc).not.toHaveBeenCalled();expect(f.storage).not.toHaveBeenCalled();
});
