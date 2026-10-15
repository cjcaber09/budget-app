import {act,renderHook,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useOverviewHighlights} from '../../src/hooks/useOverviewHighlights';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {invalidateReports} from '../../src/lib/reportCache';
const owner='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:unknown[])=>({abortSignal:()=>mockRpc(...args)})}}));
function setup(month='2026-10-01'){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
 return {client,...renderHook(({month}:{month:string})=>useOverviewHighlights(month),{wrapper,initialProps:{month}})};
}
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-16T12:00:00Z'));usePreferencesStore.setState({profile:{...defaultProfile(owner),timezone:'Asia/Manila'}});mockRpc.mockReset();mockRpc.mockResolvedValue({data:{version:1,owner,month:'2026-10-01',timezone:'Asia/Manila',today:'2026-10-16',recent:[],categories:[],methods:[]},error:null});});
afterEach(()=>{usePreferencesStore.setState({profile:null});jest.useRealTimers();});
test('month and owner changes never expose the previous context while loading',async()=>{
 const h=setup();await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));mockRpc.mockImplementation(()=>new Promise(()=>{}));h.rerender({month:'2026-09-01'});expect(h.result.current.data).toBeUndefined();
 act(()=>usePreferencesStore.setState({profile:defaultProfile(other)}));expect(h.result.current.data).toBeUndefined();h.unmount();h.client.clear();
});
test('central financial invalidation refreshes highlights without a dashboard loop',async()=>{
 const h=setup();await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));const before=mockRpc.mock.calls.length;
 await act(async()=>invalidateReports(h.client));await waitFor(()=>expect(mockRpc.mock.calls.length).toBeGreaterThan(before));expect(mockRpc.mock.calls.every(c=>c[0]==='overview_highlights')).toBe(true);h.unmount();h.client.clear();
});
test('unsupported periods never call the RPC; failures remain section local',async()=>{
 const h=setup('2029-01-01');expect(h.result.current.supported).toBe(false);expect(mockRpc).not.toHaveBeenCalled();h.unmount();h.client.clear();
 mockRpc.mockResolvedValue({data:null,error:{message:'unavailable'}});const next=setup();await waitFor(()=>expect(next.result.current.isError).toBe(true));const notify=next.client.getQueryCache().getAll()[0].meta?.shouldNotify;expect(typeof notify==='function'&&notify()).toBe(false);next.unmount();next.client.clear();
});
test('financial midnight changes the context before accepting a fresh snapshot',async()=>{
 const h=setup();await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));mockRpc.mockResolvedValue({data:{version:1,owner,month:'2026-10-01',timezone:'Asia/Manila',today:'2026-10-17',recent:[],categories:[],methods:[]},error:null});
 act(()=>{jest.setSystemTime(new Date('2026-10-16T16:01:00Z'));jest.advanceTimersByTime(30000);});await waitFor(()=>expect(h.result.current.today).toBe('2026-10-17'));await waitFor(()=>expect(h.result.current.isSuccess).toBe(true));h.unmount();h.client.clear();
});
