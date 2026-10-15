import {FunctionsHttpError} from '@supabase/supabase-js';
const mockInvoke=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{functions:{invoke:(...args:unknown[])=>mockInvoke(...args)}}}));
import {invokeReceiptScan} from '../../src/hooks/useOcr';
const input={base64:'iVBORw0KGgo=',mimeType:'image/png',requestId:'00000000-0000-4000-8000-000000000001'};
const data={scanId:input.requestId,text:'withdrawal',receipt:null};
function error(status:number,code:string){return new FunctionsHttpError({status,clone:()=>({json:async()=>({error:code})})});}
beforeEach(()=>mockInvoke.mockReset());
test.each(['invalid_request','unsupported_receipt_version'])('one v2 retry on %s preserves request/image identity',async code=>{
 mockInvoke.mockResolvedValueOnce({data:null,error:error(400,code)}).mockResolvedValueOnce({data,error:null});
 expect(await invokeReceiptScan(input)).toEqual(data);expect(mockInvoke).toHaveBeenCalledTimes(2);
 expect(mockInvoke.mock.calls.map(c=>c[1].body.receiptSchemaVersion)).toEqual([3,2]);
 expect(mockInvoke.mock.calls[1][1].body).toEqual({...mockInvoke.mock.calls[0][1].body,receiptSchemaVersion:2});
});
test.each([[400,'type_mismatch'],[401,'unauthorized'],[500,'storage_failed']])('does not retry other failures %s/%s',async(status,code)=>{mockInvoke.mockResolvedValue({data:null,error:error(Number(status),String(code))});await expect(invokeReceiptScan(input)).rejects.toThrow();expect(mockInvoke).toHaveBeenCalledTimes(1);});
test('invalid local image does not receive a version fallback',async()=>{mockInvoke.mockResolvedValue({data:null,error:error(400,'invalid_request')});await expect(invokeReceiptScan({...input,base64:'bad'})).rejects.toThrow();expect(mockInvoke).toHaveBeenCalledTimes(1);});
test('fallback rejection stops after two attempts',async()=>{mockInvoke.mockResolvedValue({data:null,error:error(400,'invalid_request')});await expect(invokeReceiptScan(input)).rejects.toThrow();expect(mockInvoke).toHaveBeenCalledTimes(2);});
