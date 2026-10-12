import {act,renderHook,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useRefunds,useSaveRefund} from '../../src/hooks/useRefunds';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
const owner='00000000-0000-4000-8000-000000000001';const expense='00000000-0000-4000-8000-000000000002';const method='00000000-0000-4000-8000-000000000003';const rid='00000000-0000-4000-8000-000000000004';
const mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:any[])=>({abortSignal:(signal:AbortSignal)=>mockRpc(...args,signal)})}}));
function setup(){const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{retry:false,gcTime:Infinity}}});const invalidate=jest.spyOn(client,'invalidateQueries');function Wrapper({children}:PropsWithChildren){return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}return {client,invalidate,...renderHook(()=>({query:useRefunds(expense),save:useSaveRefund()}),{wrapper:Wrapper})};}
const row={id:rid,user_id:owner,expense_id:expense,method_id:method,amount:'25.50',refund_date:'2026-10-12',note:null,version:1};
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.getState().setProfile(defaultProfile(owner));mockRpc.mockImplementation(name=>Promise.resolve({error:null,data:name==='refund_snapshot'?{owner,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',amount:'100.00',refunded:'25.50',rows:[row]}:{owner,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',id:rid,state:'saved',refund:row}}));});
test('reads exact cents and writes an exact stable refund payload, refreshing all financial views',async()=>{
 const h=setup();await waitFor(()=>expect(h.result.current.query.isSuccess).toBe(true));expect(h.result.current.query.data?.refunded).toBe(2550);
 await act(async()=>{await h.result.current.save.mutateAsync({id:rid,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',operation:'create',amount:'25.5',methodId:method,date:'2026-10-12'});});
 expect(mockRpc).toHaveBeenCalledWith('save_refund',{p_refund:expect.objectContaining({id:rid,amount:'25.50'})},expect.any(AbortSignal));for(const queryKey of [['refunds'],['dashboard'],['reports'],['transactions'],['paymentMethods']])expect(h.invalidate).toHaveBeenCalledWith({queryKey});h.unmount();h.client.clear();
});
test('malformed ownership and unreconciled totals fail closed',async()=>{
 mockRpc.mockResolvedValue({error:null,data:{owner,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',amount:'100.00',refunded:'0.00',rows:[row]}});const h=setup();await waitFor(()=>expect(h.result.current.query.isError).toBe(true));expect(h.result.current.query.error?.message).toContain('reconcile');h.unmount();h.client.clear();
});
test('foreign save responses do not invalidate and unversioned removal never reaches the server',async()=>{
 const h=setup();mockRpc.mockImplementation(name=>Promise.resolve({error:null,data:name==='save_refund'?{owner:'foreign',expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',id:rid,state:'saved',refund:row}:{owner,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',amount:'100.00',refunded:'25.50',rows:[row]}}));
 await act(async()=>{await expect(h.result.current.save.mutateAsync({id:rid,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',operation:'create',amount:'25.50',methodId:method,date:'2026-10-12'})).rejects.toThrow('confirm');});expect(h.invalidate).not.toHaveBeenCalled();const before=mockRpc.mock.calls.length;
 await act(async()=>{await expect(h.result.current.save.mutateAsync({id:rid,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',operation:'delete'})).rejects.toThrow('Refresh');});expect(mockRpc.mock.calls.length).toBe(before);h.unmount();h.client.clear();
});
