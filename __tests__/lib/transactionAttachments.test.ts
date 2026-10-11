jest.mock('expo-file-system',()=>({File:class{}}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('../../src/lib/prepareProofImage',()=>({prepareProofImage:jest.fn()}));
const mockRpc=jest.fn(),mockUpload=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:unknown[])=>mockRpc(...args),storage:{from:()=>({upload:(...args:unknown[])=>mockUpload(...args)})}}}));
import {uploadProof} from '../../src/lib/transactionAttachments';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
const owner='owner',transaction='transaction',file={id:'proof',name:'receipt.webp',mime:'image/webp' as const,bytes:new Uint8Array([1,2,3])};
const row={id:file.id,user_id:owner,transaction_id:transaction,object_path:'owner/transaction/proof.webp',status:'pending'};
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.getState().setProfile({user_id:owner,display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});mockRpc.mockImplementation(async(name)=>({data:name==='reserve_transaction_attachment'?row:null,error:null}));mockUpload.mockResolvedValue({error:null});});
afterEach(()=>usePreferencesStore.getState().setProfile(null));
it('uploads only prepared bytes to the reserved private path, then confirms completion',async()=>{
 await uploadProof(transaction,file,owner);expect(mockUpload).toHaveBeenCalledWith(row.object_path,file.bytes,{contentType:'image/webp',upsert:false});expect(mockRpc.mock.calls.map(c=>c[0])).toEqual(['reserve_transaction_attachment','finish_transaction_attachment']);
});
it('reconciles a lost upload response without overwriting an existing object',async()=>{
 mockUpload.mockResolvedValue({error:{statusCode:409}});await expect(uploadProof(transaction,file,owner)).resolves.toBeUndefined();
 mockRpc.mockResolvedValue({data:{...row,status:'ready'},error:null});await uploadProof(transaction,file,owner);expect(mockUpload).toHaveBeenCalledTimes(1);
});
it('rejects another owner or an unexpected path before sending bytes',async()=>{
 mockRpc.mockResolvedValue({data:{...row,object_path:'foreign/proof.webp'},error:null});await expect(uploadProof(transaction,file,owner)).rejects.toThrow();expect(mockUpload).not.toHaveBeenCalled();
 usePreferencesStore.getState().setProfile(null);await expect(uploadProof(transaction,file,owner)).rejects.toThrow('Sign in');
});
