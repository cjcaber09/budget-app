import {act,renderHook} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useAddRecurringRule} from '../../src/hooks/useRecurringRules';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
const owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:unknown[])=>mockRpc(...args)}}));
function setup(){const client=new QueryClient({defaultOptions:{mutations:{retry:false,gcTime:Infinity}}}),invalidate=jest.spyOn(client,'invalidateQueries');function Wrapper({children}:PropsWithChildren){return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}return {client,invalidate,...renderHook(()=>useAddRecurringRule(),{wrapper:Wrapper})};}
beforeEach(()=>{mockRpc.mockReset();usePreferencesStore.setState({profile:defaultProfile(owner)});});
afterEach(()=>usePreferencesStore.setState({profile:null}));
const input={createId:id,categoryId:id,amount:50,note:'Rent',frequency:'monthly' as const,nextDueDate:'2026-10-30'};
it('a lost response retries the same creation UUID and exact money payload',async()=>{
 mockRpc.mockResolvedValueOnce({error:{code:'500'}}).mockResolvedValueOnce({error:null,data:{id,user_id:owner}});
 const h=setup();await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow('draft');});expect(h.invalidate).not.toHaveBeenCalled();
 await act(async()=>{await h.result.current.mutateAsync(input);});expect(mockRpc.mock.calls[0]).toEqual(mockRpc.mock.calls[1]);
 expect(mockRpc).toHaveBeenCalledWith('save_recurring_rule',{p_rule:{...input,amount:'50.00'}});
 h.unmount();h.client.clear();
});
it.each([null,{id,user_id:id}])('does not treat an incomplete or foreign response as a confirmed bill',async(data)=>{
 mockRpc.mockResolvedValue({error:null,data});const h=setup();
 await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow('confirm');});expect(h.invalidate).not.toHaveBeenCalled();h.unmount();h.client.clear();
});
