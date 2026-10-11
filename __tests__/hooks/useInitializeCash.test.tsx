import {act,renderHook} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {PropsWithChildren} from 'react';
import {useInitializeCash} from '../../src/hooks/useInitializeCash';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
const mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:any[])=>({abortSignal:(signal:AbortSignal)=>mockRpc(...args,signal)})}}));
function setup(){const client=new QueryClient({defaultOptions:{mutations:{retry:false,gcTime:Infinity}}});const invalidate=jest.spyOn(client,'invalidateQueries');function Wrapper({children}:PropsWithChildren){return <QueryClientProvider client={client}>{children}</QueryClientProvider>;}return {client,invalidate,...renderHook(()=>useInitializeCash(),{wrapper:Wrapper})};}
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.getState().setProfile(defaultProfile('owner'));mockRpc.mockResolvedValue({error:null,data:{owner:'owner',methodId:'cash',state:'initialized'}});});
test('initialization sends exact decimals using a dedicated RPC and refreshes balance-dependent data',async()=>{
 const h=setup();await act(async()=>{await h.result.current.mutateAsync({methodId:'cash',amount:'1000.5'});});expect(mockRpc).toHaveBeenCalledWith('initialize_cash_balance',{p_method_id:'cash',p_amount:'1000.50'},expect.any(AbortSignal));
 for(const queryKey of [['paymentMethods'],['dashboard'],['reports']])expect(h.invalidate).toHaveBeenCalledWith({queryKey});h.unmount();h.client.clear();
});
test('missing RPC fails without falling back to ordinary balance editing; foreign responses fail closed',async()=>{
 const h=setup();mockRpc.mockResolvedValue({error:{code:'PGRST202'},data:null});await act(async()=>{await expect(h.result.current.mutateAsync({methodId:'cash',amount:'0'})).rejects.toThrow('not available');});expect(mockRpc).toHaveBeenCalledTimes(1);expect(h.invalidate).not.toHaveBeenCalled();
 mockRpc.mockResolvedValue({error:null,data:{owner:'foreign',methodId:'cash',state:'initialized'}});await act(async()=>{await expect(h.result.current.mutateAsync({methodId:'cash',amount:'0'})).rejects.toThrow('confirm');});expect(h.invalidate).not.toHaveBeenCalled();h.unmount();h.client.clear();
});
test('negative, blank, excessive precision and overflow amounts never reach the server',async()=>{
 const h=setup();for(const amount of ['','-1','1.001','10000000000'])await act(async()=>{await expect(h.result.current.mutateAsync({methodId:'cash',amount})).rejects.toThrow('Cash amount');});expect(mockRpc).not.toHaveBeenCalled();h.unmount();h.client.clear();
});
