import {AppState,Platform} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {initializeAppLock,unlockApp,setAppLockEnabled,handleLockAppState,lockApp} from '../../src/lib/appLock';
import {useAppLockStore} from '../../src/stores/useAppLockStore';
const originalOS=Platform.OS;
beforeEach(async()=>{Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});Object.defineProperty(AppState,'currentState',{value:'active',writable:true,configurable:true});useAppLockStore.setState({loaded:false,enabled:false,locked:true,obscured:false,busy:false,error:''});await SecureStore.deleteItemAsync('budget-tracker.biometric-lock.v1');jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValue({success:true});jest.mocked(LocalAuthentication.hasHardwareAsync).mockResolvedValue(true);jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValue(true);});
afterEach(()=>Object.defineProperty(Platform,'OS',{value:originalOS,configurable:true}));
test('enabling authenticates, persists, and a fresh launch starts locked',async()=>{
 await setAppLockEnabled(true);expect(useAppLockStore.getState().enabled).toBe(true);expect(useAppLockStore.getState().locked).toBe(false);
 await initializeAppLock();expect(useAppLockStore.getState().locked).toBe(true);
 await unlockApp();expect(useAppLockStore.getState().locked).toBe(false);expect(LocalAuthentication.authenticateAsync).toHaveBeenLastCalledWith(expect.objectContaining({disableDeviceFallback:false,biometricsSecurityLevel:'strong'}));
});
test('cancellation and backgrounding during authentication cannot unlock',async()=>{
 useAppLockStore.setState({loaded:true,enabled:true,locked:true});jest.mocked(LocalAuthentication.authenticateAsync).mockResolvedValueOnce({success:false,error:'user_cancel'});
 await unlockApp();expect(useAppLockStore.getState().locked).toBe(true);
 let finish!:(result:{success:true})=>void;jest.mocked(LocalAuthentication.authenticateAsync).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const attempt=unlockApp();handleLockAppState('background');finish({success:true});await attempt;handleLockAppState('active');expect(useAppLockStore.getState().locked).toBe(true);
});
test('a biometric prompt may go inactive without causing an endless lock loop',async()=>{
 useAppLockStore.setState({loaded:true,enabled:true,locked:true});
 let finish!:(result:{success:true})=>void;jest.mocked(LocalAuthentication.authenticateAsync).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const attempt=unlockApp();handleLockAppState('inactive');finish({success:true});await attempt;handleLockAppState('active');expect(useAppLockStore.getState().locked).toBe(false);
 lockApp();expect(useAppLockStore.getState().locked).toBe(true);
});
test('disabling requires authentication and failed storage preserves the enabled lock',async()=>{
 await setAppLockEnabled(true);jest.mocked(SecureStore.deleteItemAsync).mockRejectedValueOnce(new Error('Unavailable'));
 await expect(setAppLockEnabled(false)).rejects.toThrow(/previous setting/);expect(useAppLockStore.getState().enabled).toBe(true);
});
test('unavailable or unenrolled biometrics cannot enable the toggle',async()=>{
 jest.mocked(LocalAuthentication.isEnrolledAsync).mockResolvedValueOnce(false);await expect(setAppLockEnabled(true)).rejects.toThrow(/Set up Face ID/);expect(useAppLockStore.getState().enabled).toBe(false);
});
