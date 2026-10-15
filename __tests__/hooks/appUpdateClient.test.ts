import {useAppUpdateSnapshot,checkAppUpdate,downloadAppUpdate,restartAppUpdate} from '../../src/lib/appUpdates.native';
import {renderHook} from '@testing-library/react-native';
const mockState={isStartupProcedureRunning:false,isChecking:false,isDownloading:true,isRestarting:false,isUpdateAvailable:true,isUpdatePending:false,downloadProgress:.5,downloadedUpdate:undefined as {updateId?:string;createdAt:Date}|undefined};
const mockCheck=jest.fn(),mockFetch=jest.fn(),mockReload=jest.fn();
jest.mock('expo-updates',()=>({isEnabled:true,useUpdates:()=>mockState,checkForUpdateAsync:()=>mockCheck(),fetchUpdateAsync:()=>mockFetch(),reloadAsync:()=>mockReload()}));
test('maps native progress and update IDs without confusing rollback and no-update results',async()=>{
 const hook=renderHook(useAppUpdateSnapshot);expect(hook.result.current).toEqual(expect.objectContaining({downloading:true,progress:.5,ready:false}));
 mockState.downloadedUpdate={updateId:'owned-update',createdAt:new Date('2026-10-16T00:00:00Z')};hook.rerender({});expect(hook.result.current.pendingKey).toBe('owned-update');
 mockState.downloadedUpdate={createdAt:new Date('2026-10-16T00:00:00Z')};hook.rerender({});expect(hook.result.current.pendingKey).toBe('rollback:2026-10-16T00:00:00.000Z');
 mockCheck.mockResolvedValueOnce({isAvailable:false,isRollBackToEmbedded:true}).mockResolvedValueOnce({isAvailable:false,isRollBackToEmbedded:false});expect(await checkAppUpdate()).toBe(true);expect(await checkAppUpdate()).toBe(false);
 mockFetch.mockResolvedValueOnce({isNew:false,isRollBackToEmbedded:true}).mockResolvedValueOnce({isNew:false,isRollBackToEmbedded:false});expect(await downloadAppUpdate()).toBe(true);expect(await downloadAppUpdate()).toBe(false);
 await restartAppUpdate();expect(mockReload).toHaveBeenCalledTimes(1);
});
