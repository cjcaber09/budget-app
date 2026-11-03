import {AppState,Platform} from 'react-native';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useAppLockStore} from '../../src/stores/useAppLockStore';
import {handleLockAppState,lockApp} from '../../src/lib/appLock';
import {runNativeHandoff,invalidateNativeHandoffs,HANDOFF_TIMEOUT,recoverNativeHandoff} from '../../src/lib/nativeHandoff';
import {encryptedStorage} from '../../src/lib/encryptedStorage';
import * as ImagePicker from 'expo-image-picker';
jest.mock('expo-image-picker',()=>({getPendingResultAsync:jest.fn()}));
jest.mock('../../src/lib/encryptedStorage',()=>({encryptedStorage:{setItem:jest.fn(async()=>{}),removeItem:jest.fn(async()=>{}),getItem:jest.fn(async()=>null)}}));
const owner='00000000-0000-4000-8000-000000000001';
beforeEach(()=>{jest.useFakeTimers();Object.defineProperty(Platform,'OS',{value:'android',configurable:true});Object.defineProperty(AppState,'currentState',{value:'active',writable:true,configurable:true});invalidateNativeHandoffs();usePreferencesStore.getState().setProfile(defaultProfile(owner));useAppLockStore.setState({enabled:true,loaded:true,locked:false,obscured:false,busy:false});});
afterEach(()=>{invalidateNativeHandoffs();jest.useRealTimers();});
function state(next:string){Object.defineProperty(AppState,'currentState',{value:next,configurable:true});handleLockAppState(next);}
test.each(['receipt-camera','receipt-upload','microphone','notification-permission'] as const)('%s returns without authentication, then ordinary background locks',async purpose=>{
 let finish!:(value:string)=>void;
 const operation=runNativeHandoff(purpose,()=>new Promise<string>(resolve=>{finish=resolve;}));
 // encrypted marker publication precedes the native launch.
 for(let i=0;i<20&&!finish;i++)await Promise.resolve();
 expect(finish).toBeDefined();state('background');expect(useAppLockStore.getState()).toMatchObject({locked:false,obscured:true});
 state('active');finish('selected');await operation;
 expect(useAppLockStore.getState()).toMatchObject({locked:false,obscured:false});
 state('background');expect(useAppLockStore.getState().locked).toBe(true);
});
test('picker completion before foreground remains guarded until return',async()=>{
 await runNativeHandoff('microphone',async()=>{state('inactive');state('active');});
 expect(useAppLockStore.getState().locked).toBe(false);
});
test('expiry and explicit locking cannot be undone by a picker result',async()=>{
 await runNativeHandoff('receipt-camera',async()=>{state('background');jest.advanceTimersByTime(HANDOFF_TIMEOUT+1);state('active');});
 expect(useAppLockStore.getState().locked).toBe(true);
 useAppLockStore.setState({locked:false});
 await runNativeHandoff('receipt-upload',async()=>{lockApp();state('active');});
 expect(useAppLockStore.getState().locked).toBe(true);
});
test('an already locked app cannot acquire a guard',async()=>{
 useAppLockStore.setState({locked:true});const action=jest.fn();await expect(runNativeHandoff('microphone',action)).rejects.toThrow(/Unlock/);expect(action).not.toHaveBeenCalled();
});
test('activity recovery retains purpose and rejects expired or foreign markers',async()=>{
 const marker={owner,purpose:'receipt-upload',visit:'fresh',startedAt:Date.now()};
 jest.mocked(ImagePicker.getPendingResultAsync).mockResolvedValue({canceled:false,assets:[]} as ImagePicker.ImagePickerResult);
 jest.mocked(encryptedStorage.getItem).mockResolvedValue(JSON.stringify(marker));
 expect((await recoverNativeHandoff())?.marker.purpose).toBe('receipt-upload');
 jest.mocked(encryptedStorage.getItem).mockResolvedValue(JSON.stringify({...marker,startedAt:Date.now()-900001}));expect(await recoverNativeHandoff()).toBeNull();
 jest.mocked(encryptedStorage.getItem).mockResolvedValue(JSON.stringify({...marker,owner:'another-owner'}));expect(await recoverNativeHandoff()).toBeNull();
});
