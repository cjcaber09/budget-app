import {act,cleanup,renderHook,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useOcrScans,type OcrScanRow} from '../../src/hooks/useOcr';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import type {PropsWithChildren} from 'react';
let mockRows:OcrScanRow[]=[];let mockFail=false;
const mockRequests=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{from:()=>{
 const filters:Record<string,string>={};let cursor='';
 const q={select:()=>q,eq:(key:string,value:string)=>{filters[key]=value;return q;},order:()=>q,or:(value:string)=>{cursor=value;return q;},limit:()=>q,abortSignal:()=>{
  mockRequests({filters,cursor});if(mockFail){mockFail=false;return Promise.resolve({data:null,error:new Error('Offline')});}
  const id=cursor.match(/id\.lt\.([^)]*)/)?.[1];
  return Promise.resolve({data:mockRows.filter(r=>r.user_id===filters.user_id&&(!id||r.id<id)).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,21),error:null});
 }};return q;
}}}));
let client:QueryClient;
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});mockRequests.mockClear();mockFail=false;mockRows=Array.from({length:45},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,user_id:'owner',char_count:i,created_at:'2026-10-08T00:00:00+00:00'}));usePreferencesStore.getState().setProfile({user_id:'owner',display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});});
afterEach(()=>{cleanup();client.clear();usePreferencesStore.getState().setProfile(null);});
function mount(){return renderHook(()=>useOcrScans(),{wrapper:({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>});}
it('loads every scan once, including equal timestamps, and stops at the last page',async()=>{
 const {result}=mount();await waitFor(()=>expect(result.current.data).toHaveLength(20));
 await act(async()=>{await result.current.fetchNextPage();});await waitFor(()=>expect(result.current.data).toHaveLength(40));
 expect(mockRequests.mock.calls[1][0].cursor).toContain('created_at.eq.2026-10-08T00:00:00+00:00');
 await act(async()=>{await result.current.fetchNextPage();});await waitFor(()=>expect(result.current.data).toHaveLength(45));expect(new Set(result.current.data?.map(r=>r.id)).size).toBe(45);expect(result.current.hasNextPage).toBe(false);
});
it('does not skip older scans when a newer scan is removed between pages',async()=>{
 const {result}=mount();await waitFor(()=>expect(result.current.data).toHaveLength(20));const first=result.current.data![0].id;mockRows=mockRows.filter(r=>r.id!==first);
 await act(async()=>{await result.current.fetchNextPage();});await waitFor(()=>expect(result.current.data).toHaveLength(40));expect(result.current.data?.[20].id).toBe('00000000-0000-4000-8000-000000000025');
 await act(async()=>{await client.invalidateQueries({queryKey:['ocrScans']});});await waitFor(()=>expect(result.current.data?.some(r=>r.id===first)).toBe(false));expect(new Set(result.current.data?.map(r=>r.id)).size).toBe(result.current.data?.length);
});
it('keeps loaded pages on a failed load and retries the same cursor',async()=>{
 const {result}=mount();await waitFor(()=>expect(result.current.data).toHaveLength(20));mockFail=true;
 await act(async()=>{await result.current.fetchNextPage();});await waitFor(()=>expect(result.current.isFetchNextPageError).toBe(true));expect(result.current.data).toHaveLength(20);
 await act(async()=>{await result.current.fetchNextPage();});await waitFor(()=>expect(result.current.data).toHaveLength(40));expect(mockRequests.mock.calls[1][0].cursor).toBe(mockRequests.mock.calls[2][0].cursor);
});
it('isolates accounts and does not fetch without an owner',async()=>{
 const {result}=mount();await waitFor(()=>expect(result.current.data).toHaveLength(20));
 act(()=>usePreferencesStore.getState().setProfile({user_id:'other',display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'}));await waitFor(()=>expect(result.current.data).toEqual([]));
 act(()=>usePreferencesStore.getState().setProfile(null));expect(result.current.data).toBeUndefined();const requests=mockRequests.mock.calls.length;await act(async()=>{});expect(mockRequests).toHaveBeenCalledTimes(requests);
});
