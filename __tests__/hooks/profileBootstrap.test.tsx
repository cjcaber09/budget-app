import {act,render,screen,waitFor} from '@testing-library/react-native';
import {Text} from 'react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {useUiStore} from '../../src/stores/useUiStore';
import {ProfileBootstrap} from '../../src/hooks/useProfile';
import {usePreferencesStore,type Profile} from '../../src/stores/usePreferencesStore';
const owner='00000000-0000-4000-8000-000000000001';
const profile:Profile={user_id:owner,display_name:'Test',avatar_path:null,appearance:'system',currency:'USD',timezone:'Asia/Manila'};
let mockOwner:string|undefined=owner;let mockSignal:AbortSignal;
const mockRead=jest.fn();const mockCreate=jest.fn();const mockFinalRead=jest.fn();
jest.mock('../../src/hooks/useSession',()=>({useSession:()=>({session:mockOwner?{user:{id:mockOwner,user_metadata:{}}}:null,error:null,refresh:jest.fn()})}));
jest.mock('../../src/lib/supabase',()=>({supabase:{
 from:()=>{const q={select:()=>q,eq:()=>q,abortSignal:(signal:AbortSignal)=>{mockSignal=signal;return q;},upsert:(value:unknown,options:unknown)=>{mockCreate(value,options);return q;},then:(resolve:(value:unknown)=>void)=>Promise.resolve({error:null}).then(resolve),single:()=>mockFinalRead(),maybeSingle:()=>mockRead(mockSignal)};return q;},
 channel:()=>{const c={on:()=>c,subscribe:()=>c};return c;},removeChannel:jest.fn(),
}}));
let client:QueryClient;
beforeEach(()=>{mockOwner=owner;mockRead.mockReset();mockCreate.mockReset();mockFinalRead.mockResolvedValue({data:profile,error:null});mockRead.mockResolvedValue({data:profile,error:null});usePreferencesStore.getState().setProfile(null);client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});});
afterEach(()=>{client.clear();usePreferencesStore.getState().setProfile(null);jest.useRealTimers();});
function mount(){return render(<QueryClientProvider client={client}><ProfileBootstrap/><Text>Dashboard ready</Text></QueryClientProvider>);}
it('republishes an unchanged cached profile after the preferences store resets',async()=>{
 client.setQueryData(['profile',owner],profile);mount();await waitFor(()=>expect(screen.getByText('Dashboard ready')).toBeTruthy());
 act(()=>usePreferencesStore.getState().setProfile(null));
 await waitFor(()=>expect(screen.getByText('Dashboard ready')).toBeTruthy());
 expect(usePreferencesStore.getState().profile?.user_id).toBe(owner);
});
it('does not restore a previous owner profile after logout',async()=>{
 const {rerender}=mount();await waitFor(()=>expect(screen.getByText('Dashboard ready')).toBeTruthy());
 mockOwner=undefined;act(()=>usePreferencesStore.getState().setProfile(null));
 rerender(<QueryClientProvider client={client}><ProfileBootstrap/><Text>Dashboard ready</Text></QueryClientProvider>);
 expect(usePreferencesStore.getState().profile).toBeNull();
});
it('aborts a stalled profile request rather than leaving it loading indefinitely',async()=>{
 jest.useFakeTimers({doNotFake:['queueMicrotask']});mockRead.mockImplementation((signal:AbortSignal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({data:null,error:new Error('Request timed out')}),{once:true})));
 mount();await act(async()=>{await jest.advanceTimersByTimeAsync(12000);});
 expect(mockSignal.aborted).toBe(true);
});

it('uses owner defaults immediately while a profile request is pending',async()=>{
 mockRead.mockImplementation((signal:AbortSignal)=>new Promise(resolve=>signal.addEventListener('abort',()=>resolve({data:null,error:new Error('Cancelled')}),{once:true})));mount();
 await waitFor(()=>expect(usePreferencesStore.getState().profile).toMatchObject({user_id:owner,appearance:'system',currency:'USD',avatar_path:null}));
 expect(screen.getByText('Dashboard ready')).toBeTruthy();
});
it('replaces defaults with saved preferences when the response arrives',async()=>{
 let resolve!:(value:unknown)=>void;mockRead.mockImplementation(()=>new Promise(r=>{resolve=r;}));mount();
 await waitFor(()=>expect(usePreferencesStore.getState().profile?.currency).toBe('USD'));
 await act(async()=>resolve({data:{...profile,currency:'PHP',appearance:'dark'},error:null}));
 await waitFor(()=>expect(usePreferencesStore.getState().profile?.currency).toBe('PHP'));
 expect(usePreferencesStore.getState().profile?.appearance).toBe('dark');
});

it('creates a genuinely missing remote profile without overwriting an existing one',async()=>{
 mockRead.mockResolvedValue({data:null,error:null});mount();
 await waitFor(()=>expect(usePreferencesStore.getState().profile?.display_name).toBe('Test'));
 expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({user_id:owner,display_name:'',timezone:expect.any(String)}),{onConflict:'user_id',ignoreDuplicates:true});
});

it.each(['2026-11-01','2026-08-01'])('corrects fallback month boundaries but preserves selected historical month %s',async(selected)=>{
 jest.useFakeTimers({doNotFake:['queueMicrotask']});jest.setSystemTime(new Date('2026-11-01T00:30:00Z'));
 usePreferencesStore.getState().setProfile({...profile,timezone:'UTC'});useUiStore.getState().setSelectedMonth(selected);
 const saved={...profile,timezone:'America/Los_Angeles'};client.setQueryData(['profile',owner],saved);mockRead.mockResolvedValue({data:saved,error:null});mount();
 expect(useUiStore.getState().selectedMonth).toBe(selected==='2026-11-01'?'2026-10-01':selected);
});
