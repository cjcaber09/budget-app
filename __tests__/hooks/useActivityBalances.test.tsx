import {act,renderHook,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {AppState} from 'react-native';
import type {PropsWithChildren} from 'react';
import {useActivityBalances} from '../../src/hooks/useActivityBalances';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {localDateKey} from '../../src/domain/transactionDates';
const mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:unknown[])=>({abortSignal:(signal:AbortSignal)=>mockRpc(...args,signal)})}}));
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const profile={user_id:owner,timezone:'Asia/Manila'} as any;
function setup(entries=[{kind:'transaction' as const,id}]){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 function Wrapper({children}:PropsWithChildren){return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}
 return {client,...renderHook(()=>useActivityBalances(entries),{wrapper:Wrapper})};
}
beforeEach(()=>{usePreferencesStore.setState({profile});mockRpc.mockReset();mockRpc.mockImplementation((_name,{p_entries})=>Promise.resolve({error:null,data:{owner,timezone:'Asia/Manila',today:localDateKey(new Date(),'Asia/Manila'),reconciled:true,rows:p_entries.map((e:unknown)=>({...e as object,accounts:[]}))}}));});
afterEach(()=>usePreferencesStore.setState({profile:null}));
test('batches requested identities and refuses data from another owner',async()=>{
 mockRpc.mockImplementation((_name,{p_entries})=>Promise.resolve({error:null,data:{owner:'foreign',timezone:'Asia/Manila',today:localDateKey(new Date(),'Asia/Manila'),reconciled:true,rows:p_entries.map((e:unknown)=>({...e as object,accounts:[]}))}}));
 const h=setup();await waitFor(()=>expect(h.result.current.isError).toBe(true));expect(h.result.current.data).toBeUndefined();h.unmount();h.client.clear();
});
test('uses separate bounded requests beyond 100 activities and never loses identities',async()=>{
 const entries=Array.from({length:101},(_,i)=>({kind:'transaction' as const,id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`}));
 const h=setup(entries);await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));expect(mockRpc).toHaveBeenCalledTimes(2);expect(mockRpc.mock.calls[0][1].p_entries).toHaveLength(100);expect(h.result.current.data?.size).toBe(101);h.unmount();h.client.clear();
});
test('canonical string ordering reuses the same cache entry for reordered and duplicate identities',async()=>{
 const entries=[{kind:'transaction' as const,id},{kind:'transaction' as const,id:'00000000-0000-4000-8000-000000000003'}];
 const h=setup(entries);await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));
 const originalKeys=h.client.getQueryCache().getAll().map(q=>q.queryHash);
 entries.reverse();entries.push(entries[0]);h.rerender({});
 await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));
 expect(h.client.getQueryCache().getAll().map(q=>q.queryHash)).toEqual(originalKeys);expect(mockRpc).toHaveBeenCalledTimes(1);
 h.unmount();h.client.clear();
});
test('keeps batches serial and stops immediately if the first batch fails',async()=>{
 let resolveFirst:((value:unknown)=>void)|undefined;
 mockRpc.mockImplementation(()=>new Promise(resolve=>{resolveFirst=resolve;}));
 const entries=Array.from({length:101},(_,i)=>({kind:'transaction' as const,id:`00000000-0000-4000-8000-${String(i+10).padStart(12,'0')}`}));
 const h=setup(entries);await waitFor(()=>expect(mockRpc).toHaveBeenCalledTimes(1));
 expect(h.result.current.isError).toBe(false);
 await act(async()=>{resolveFirst?.({error:{code:'500'},data:null});});
 await waitFor(()=>expect(h.result.current.isError).toBe(true));expect(mockRpc).toHaveBeenCalledTimes(1);expect(h.result.current.data).toBeUndefined();h.unmount();h.client.clear();
});
test('refreshes on foreground and isolates an account change',async()=>{
 let listener:((state:string)=>void)|undefined;
 const spy=jest.spyOn(AppState,'addEventListener').mockImplementation((_event,fn)=>{listener=fn as typeof listener;return {remove:jest.fn()};});
 const h=setup();await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));
 act(()=>listener?.('active'));await waitFor(()=>expect(mockRpc).toHaveBeenCalledTimes(2));
 act(()=>usePreferencesStore.setState({profile:null}));await waitFor(()=>expect(h.result.current.data).toBeUndefined());h.unmount();h.client.clear();spy.mockRestore();
});
