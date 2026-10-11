import {QueryClient} from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {resetFinancialClientState} from '../../src/lib/resetFinancialClientState';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useScanStore} from '../../src/stores/useScanStore';
const mockCancel=jest.fn(),mockExports=jest.fn();
jest.mock('../../src/lib/phoneNotifications',()=>({serializeNotifications:async(fn:()=>unknown)=>fn(),cancelPhoneReminders:(...args:unknown[])=>mockCancel(...args)}));
jest.mock('../../src/lib/exportFiles',()=>({clearExportFiles:()=>mockExports()}));
beforeEach(()=>{jest.clearAllMocks();mockCancel.mockResolvedValue(undefined);mockExports.mockResolvedValue(undefined);usePreferencesStore.setState({profile:{...defaultProfile('owner-a'),display_name:'Keep me',currency:'PHP',appearance:'dark',timezone:'Asia/Manila'}});});
it('clears finance caches, scans and own alert history but keeps profile and other owners',async()=>{
 const client=new QueryClient(),profile=usePreferencesStore.getState().profile;client.setQueryData(['transactions','owner-a'],[{amount:10}]);useScanStore.getState().setPendingImage({requestId:'scan',uri:'local',base64:'x',mimeType:'image/jpeg'});
 await AsyncStorage.multiSet([['budget-alerts:owner-a:initialized','1'],['budget-alerts:owner-a:2026-10-01','{}'],['budget-alerts:owner-b:initialized','1']]);
 await resetFinancialClientState(client,'owner-a');expect(client.getQueryData(['transactions','owner-a'])).toBeUndefined();expect(useScanStore.getState().pendingImage).toBeNull();expect(usePreferencesStore.getState().profile).toEqual(profile);expect(await AsyncStorage.getItem('budget-alerts:owner-a:initialized')).toBeNull();expect(await AsyncStorage.getItem('budget-alerts:owner-b:initialized')).toBe('1');expect(mockCancel).toHaveBeenCalledWith('owner-a');
});
it('does not clear a different owner when the account changes during file cleanup',async()=>{
 const client=new QueryClient();client.setQueryData(['transactions','owner-b'],[{amount:20}]);mockExports.mockImplementation(async()=>{usePreferencesStore.setState({profile:defaultProfile('owner-b')});});
 await expect(resetFinancialClientState(client,'owner-a')).rejects.toThrow('owner_changed');expect(client.getQueryData(['transactions','owner-b'])).toEqual([{amount:20}]);client.clear();
});
