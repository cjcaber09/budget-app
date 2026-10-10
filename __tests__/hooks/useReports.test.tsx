import {act,renderHook,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useReports,useReportTransactions,useReportTransfers} from '../../src/hooks/useReports';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {owner,context,rawReport,category} from '../../test-utils/report';
const mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:any[])=>({abortSignal:()=>mockRpc(...args)})}}));
function setup(month='2026-10-01') {
 const client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
 function Wrapper({children}:PropsWithChildren){return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}
 return {client,...renderHook(()=>({report:useReports(month),history:useReportTransactions(month),transfers:useReportTransfers(month)}),{wrapper:Wrapper})};
}
const tx={id:category,user_id:owner,type:'expense',category_id:null,income_source_id:null,payment_method_id:null,payment_method_kind:'cash',financial_date:context.month,occurred_at:'2026-10-01T00:00:00Z',amount:'100',note:null};
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-10-09T12:00:00Z'));mockRpc.mockReset();usePreferencesStore.setState({profile:{...defaultProfile(owner),timezone:context.timezone}});mockRpc.mockImplementation(name=>Promise.resolve({error:null,data:name==='reporting_snapshot'?rawReport():{...context,rows:[]}}));});
afterEach(()=>{usePreferencesStore.setState({profile:null});jest.useRealTimers();});
test('automatically reads complete histories beyond 1000 rows with explicit Cash information',async()=>{
 mockRpc.mockImplementation(name=>Promise.resolve({error:null,data:name==='reporting_snapshot'?rawReport():{...context,rows:name==='report_transaction_history'?Array.from({length:1001},()=>({...tx})):Array.from({length:1001},()=>({id:category,source_id:owner,destination_id:category,source_name:'Cash',destination_name:'Bank',transfer_date:context.month,amount:'12345',note:null}))}}));
 const h=setup();await waitFor(()=>expect(h.result.current.history.isSuccess).toBe(true));expect(h.result.current.history.data).toHaveLength(1001);expect(h.result.current.history.data?.[0].payment_method_kind).toBe('cash');await waitFor(()=>expect(h.result.current.transfers.isSuccess).toBe(true));expect(h.result.current.transfers.data).toHaveLength(1001);expect(h.result.current.transfers.data?.[0].amount).toBe(12345);h.unmount();h.client.clear();
});
test('owner changes remove all previous report and history values while new data loads',async()=>{
 const h=setup();await waitFor(()=>expect(h.result.current.report.isSuccess).toBe(true));mockRpc.mockImplementation(()=>new Promise(()=>{}));act(()=>usePreferencesStore.setState({profile:defaultProfile(category)}));expect(h.result.current.report.data).toBeUndefined();expect(h.result.current.history.data).toBeUndefined();expect(h.result.current.transfers.data).toBeUndefined();h.unmount();h.client.clear();
});
test('invalid deep-link periods never call preparation or histories',()=>{const h=setup('2028-11-01');expect(h.result.current.report.supported).toBe(false);expect(mockRpc).not.toHaveBeenCalled();h.unmount();h.client.clear();});
test('foreign ownership in otherwise correct history context is rejected',async()=>{
 mockRpc.mockImplementation(name=>Promise.resolve({error:null,data:name==='reporting_snapshot'?rawReport():{...context,rows:name==='report_transaction_history'?[{...tx,user_id:category}]:[]}}));const h=setup();await waitFor(()=>expect(h.result.current.history.isError).toBe(true));expect(h.result.current.history.data).toBeUndefined();expect(h.result.current.report.data?.totals.data?.expense).toBe(60000);h.unmount();h.client.clear();
});
test('financial-day rollover changes the snapshot cache context and refetches',async()=>{
 const h=setup();await waitFor(()=>expect(h.result.current.report.isSuccess).toBe(true));mockRpc.mockImplementation(name=>Promise.resolve({error:null,data:name==='reporting_snapshot'?{...rawReport(),today:'2026-10-10'}:{...context,rows:[]}}));act(()=>{jest.setSystemTime(new Date('2026-10-09T16:01:00Z'));jest.advanceTimersByTime(30000);});await waitFor(()=>expect(h.result.current.report.data?.today).toBe('2026-10-10'));h.unmount();h.client.clear();
});
