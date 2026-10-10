import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useMonthlyTotals } from '../../src/hooks/useMonthlyTotals';
import { useDashboard } from '../../src/hooks/useDashboard';
import { defaultProfile, usePreferencesStore } from '../../src/stores/usePreferencesStore';
const mockRpc = jest.fn();
jest.mock('../../src/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
const month = '2026-10-01';
function setup(dashboard = false) {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
 const invalidate = jest.spyOn(client, 'invalidateQueries');
 function Wrapper({children}:PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
 return {client,invalidate,...renderHook(({enabled}: {enabled:boolean})=>({trend:useMonthlyTotals(6),snapshot:useDashboard(month,enabled)}),{wrapper:Wrapper,initialProps:{enabled:dashboard}})};
}
beforeEach(()=>{
 jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-09T12:00:00Z'));
 usePreferencesStore.setState({profile:{...defaultProfile('owner'),timezone:'UTC'}});
 mockRpc.mockReset();mockRpc.mockResolvedValue({data:[],error:null});
});
afterEach(()=>{usePreferencesStore.setState({profile:null});jest.useRealTimers();});
test('waits for owner preferences and uses complete server aggregation, not a capped transaction fetch',async()=>{
 usePreferencesStore.setState({profile:null});const h=setup();expect(mockRpc).not.toHaveBeenCalled();
 mockRpc.mockResolvedValue({data:[{month,total:'12345.67'}],error:null});
 act(()=>usePreferencesStore.setState({profile:{...defaultProfile('owner'),timezone:'UTC'}}));
 await waitFor(()=>expect(h.result.current.trend.isSuccess).toBe(true));
 expect(h.result.current.trend.data).toHaveLength(6);expect(h.result.current.trend.data?.[5]).toEqual({month,total:12345.67});
 expect(mockRpc).toHaveBeenCalledWith('monthly_expense_totals',{p_start:'2026-05-01',p_end:'2026-11-01'});
 h.unmount();h.client.clear();
});
test('refreshes an already-loaded trend after successful bill preparation without invalidating itself',async()=>{
 let total=10;
 mockRpc.mockImplementation(async(name:string)=> {
  if(name==='prepare_dashboard'){total=70;return {data:null,error:null};}
  if(name==='dashboard_snapshot')return {data:{complete:true,month,today:'2026-10-09',timezone:'UTC',expenseCents:7000},error:null};
  return {data:[{month,total}],error:null};
 });
 const h=setup();await waitFor(()=>expect(h.result.current.trend.data?.[5].total).toBe(10));
 h.rerender({enabled:true});await waitFor(()=>expect(h.result.current.snapshot.isSuccess).toBe(true));
 await waitFor(()=>expect(h.result.current.trend.data?.[5].total).toBe(70));
 expect(h.invalidate).toHaveBeenCalledWith({queryKey:['monthlyTotals']});
 expect(h.invalidate).not.toHaveBeenCalledWith({queryKey:['dashboard']});
 expect(mockRpc.mock.calls.filter(c=>c[0]==='prepare_dashboard')).toHaveLength(1);
 h.unmount();h.client.clear();
});
test('failed aggregate remains an error instead of zero-filled successful history',async()=>{
 mockRpc.mockResolvedValue({data:null,error:new Error('synthetic failure')});const h=setup();
 await waitFor(()=>expect(h.result.current.trend.isError).toBe(true));expect(h.result.current.trend.data).toBeUndefined();h.unmount();h.client.clear();
});
test('financial timezone determines the trend range across a year boundary',async()=>{
 jest.setSystemTime(new Date('2026-12-31T18:00:00Z'));
 usePreferencesStore.setState({profile:{...defaultProfile('owner'),timezone:'Asia/Manila'}});
 const h=setup();await waitFor(()=>expect(h.result.current.trend.isSuccess).toBe(true));
 expect(mockRpc).toHaveBeenCalledWith('monthly_expense_totals',{p_start:'2026-08-01',p_end:'2027-02-01'});h.unmount();h.client.clear();
});
test('switching owners does not expose the previous owner trend',async()=>{
 mockRpc.mockResolvedValue({data:[{month,total:100}],error:null});const h=setup();await waitFor(()=>expect(h.result.current.trend.data?.[5].total).toBe(100));
 mockRpc.mockImplementation(()=>new Promise(()=>{}));
 act(()=>usePreferencesStore.setState({profile:{...defaultProfile('other'),timezone:'UTC'}}));
 expect(h.result.current.trend.data).toBeUndefined();h.unmount();h.client.clear();
});
