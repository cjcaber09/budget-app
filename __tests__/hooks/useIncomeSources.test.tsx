import {act,renderHook} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useSaveIncomeSource} from '../../src/hooks/useIncomeSources';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {owner,category} from '../../test-utils/report';
const mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:any[])=>({abortSignal:()=>mockRpc(...args)})}}));
function setup(){const client=new QueryClient({defaultOptions:{mutations:{retry:false,gcTime:Infinity}}}),invalidate=jest.spyOn(client,'invalidateQueries');function Wrapper({children}:PropsWithChildren){return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}return {client,invalidate,...renderHook(()=>useSaveIncomeSource(),{wrapper:Wrapper})};}
beforeEach(()=>{mockRpc.mockReset();usePreferencesStore.setState({profile:defaultProfile(owner)});});
afterEach(()=>usePreferencesStore.setState({profile:null}));
test('a lost source response retries the same ID and canonical name before refreshing reports',async()=>{
 mockRpc.mockResolvedValueOnce({error:{code:'500'},data:null}).mockResolvedValueOnce({error:null,data:{id:category,user_id:owner,name:'Work',archived:false}});const h=setup(),input={id:category,operation:'create' as const,name:' Work '};await act(async()=>{await expect(h.result.current.mutateAsync(input)).rejects.toThrow('draft');});expect(h.invalidate).not.toHaveBeenCalled();await act(async()=>{await h.result.current.mutateAsync(input);});expect(mockRpc.mock.calls[0]).toEqual(mockRpc.mock.calls[1]);expect(mockRpc).toHaveBeenCalledWith('save_income_source',{p_source:{id:category,operation:'create',name:'Work'}});expect(h.invalidate).toHaveBeenCalledWith({queryKey:['reports']});h.unmount();h.client.clear();
});
test('a foreign response cannot populate sources or reports',async()=>{mockRpc.mockResolvedValue({error:null,data:{id:category,user_id:category,name:'Foreign',archived:false}});const h=setup();await act(async()=>{await expect(h.result.current.mutateAsync({id:category,operation:'create',name:'Work'})).rejects.toThrow('incomplete');});expect(h.invalidate).not.toHaveBeenCalled();h.unmount();h.client.clear();});
