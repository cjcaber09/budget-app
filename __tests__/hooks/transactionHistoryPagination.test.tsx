import {act,cleanup,renderHook,waitFor} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useTransactionHistory} from '../../src/hooks/useTransactionHistory';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {decodeTransactionPage} from '../../src/domain/transactionPages';
const owner='00000000-0000-4000-8000-000000009921',month='2026-10-01';
const mockRpc=jest.fn();let mockFail=false;
const mockRows=Array.from({length:25},(_,i)=>({id:'00000000-0000-4000-8000-'+String(100-i).padStart(12,'0'),user_id:owner,financial_date:month,transaction_date:month,occurred_at:month+'T12:00:00Z',type:i<12?'expense':'income',amount:'1000.50',category_id:null,note:'Page '+i,recurring_rule_id:null}));
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(name:string,p:any)=>({abortSignal:()=>{
 mockRpc(name,p);if(mockFail){mockFail=false;return Promise.resolve({error:{code:'offline'}});}
 const matched=mockRows.filter(r=>(p.p_type==='all'||r.type===p.p_type)&&(!p.p_search||r.note.toLowerCase().includes(p.p_search))&&(!p.p_before_id||r.id<p.p_before_id));
 const page=p.p_month==='2026-10-01'&&require('../../src/stores/usePreferencesStore').usePreferencesStore.getState().profile?.user_id==='00000000-0000-4000-8000-000000009921'?matched.slice(0,10):[];
 const last=page.at(-1),more=matched.length>10&&page.length===10;
 return Promise.resolve({error:null,data:{owner:require('../../src/stores/usePreferencesStore').usePreferencesStore.getState().profile?.user_id,month:p.p_month,timezone:require('../../src/stores/usePreferencesStore').usePreferencesStore.getState().profile?.timezone,rows:page,has_more:more,next:more?{date:last!.financial_date,at:last!.occurred_at,id:last!.id}:null}});
}})}}));
let client:QueryClient;
beforeEach(()=>{client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});mockRpc.mockClear();mockFail=false;usePreferencesStore.getState().setProfile({user_id:owner,display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});});
afterEach(()=>{cleanup();client.clear();usePreferencesStore.getState().setProfile(null);});
const wrapper=({children}:PropsWithChildren)=><QueryClientProvider client={client}>{children}</QueryClientProvider>;
test('loads 10 at a time, preserves pages on failure and retries the same cursor',async()=>{
 const {result}=renderHook(()=>useTransactionHistory(month,'all',''),{wrapper});await waitFor(()=>expect(result.current.data).toHaveLength(10));
 mockFail=true;await act(async()=>{await result.current.fetchNextPage();});expect(result.current.data).toHaveLength(10);await waitFor(()=>expect(result.current.isFetchNextPageError).toBe(true));
 await act(async()=>{await result.current.fetchNextPage();});expect(result.current.data).toHaveLength(20);expect(mockRpc.mock.calls[1][1]).toEqual(mockRpc.mock.calls[2][1]);
 await act(async()=>{await result.current.fetchNextPage();});expect(result.current.data).toHaveLength(25);expect(result.current.hasNextPage).toBe(false);expect(new Set(result.current.data?.map(r=>r.id)).size).toBe(25);
});
test('filters before paging and isolates filters, month, timezone and owner',async()=>{
 const {result,rerender}=renderHook<ReturnType<typeof useTransactionHistory>,{filter:'all'|'income';search:string;m:string}>(({filter,search,m})=>useTransactionHistory(m,filter,search),{wrapper,initialProps:{filter:'all' as 'all'|'income',search:'',m:month}});
 await waitFor(()=>expect(result.current.data).toHaveLength(10));
 rerender({filter:'income',search:'page 24',m:month});await waitFor(()=>expect(result.current.data).toHaveLength(1));expect(mockRpc.mock.calls.at(-1)![1]).toMatchObject({p_type:'income',p_search:'page 24',p_before_id:null});
 rerender({filter:'all',search:'',m:'2026-09-01'});await waitFor(()=>expect(result.current.data).toEqual([]));
 act(()=>usePreferencesStore.getState().setProfile({...usePreferencesStore.getState().profile!,timezone:'Asia/Manila'}));await waitFor(()=>expect(mockRpc.mock.calls.length).toBeGreaterThan(3));
 act(()=>usePreferencesStore.getState().setProfile(null));expect(result.current.data).toBeUndefined();
});
test('rejects malformed scope and cursors without rendering fabricated rows',()=>{
 const data={owner,month,timezone:'UTC',rows:mockRows.slice(0,10),has_more:true,next:{date:month,at:mockRows[9].occurred_at,id:mockRows[9].id}};
 expect(decodeTransactionPage(data,owner,month,'UTC').rows[0].amount).toBe(1000.5);
 expect(()=>decodeTransactionPage({...data,owner:'foreign'},owner,month,'UTC')).toThrow();
 expect(()=>decodeTransactionPage({...data,next:{...data.next,id:mockRows[0].id}},owner,month,'UTC')).toThrow();
});
