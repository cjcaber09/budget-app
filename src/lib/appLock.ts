import {AppState,Platform} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {useAppLockStore} from '../stores/useAppLockStore';

const preference='budget-tracker.biometric-lock.v1';
let generation=0,prompt:Promise<boolean>|null=null;
export async function initializeAppLock(){
  try{
    const raw=Platform.OS==='web'?null:await SecureStore.getItemAsync(preference);
    if(raw!==null&&raw!=='enabled')throw new Error('Invalid lock preference');
    const enabled=raw==='enabled';
    useAppLockStore.setState({loaded:true,enabled,locked:enabled,error:''});
  }catch{useAppLockStore.setState({loaded:false,locked:true,error:'Could not read app-lock settings. Retry to unlock safely.'});}
}
export function handleLockAppState(next:string){
  const state=useAppLockStore.getState();if(!state.enabled)return;
  if(next==='active'){useAppLockStore.setState({obscured:false});return;}
  useAppLockStore.setState({obscured:true});
  if(next==='background'||!state.busy){generation++;useAppLockStore.setState({locked:true});}
}
export function lockApp(){generation++;useAppLockStore.setState({locked:true,error:''});}
async function verify():Promise<boolean>{
  if(Platform.OS==='web')return false;
  if(prompt)return prompt;
  const attempt=generation;
  useAppLockStore.setState({busy:true,error:''});
  prompt=(async()=>{
    try{
      const result=await LocalAuthentication.authenticateAsync({promptMessage:'Unlock Budget Tracker',cancelLabel:'Cancel',fallbackLabel:'Use device passcode',disableDeviceFallback:false,biometricsSecurityLevel:'strong'});
      if(attempt!==generation||AppState.currentState==='background')return false;
      if(!result.success){useAppLockStore.setState({error:'Not unlocked. Try biometrics again or use your device passcode.'});return false;}
      return true;
    }catch{useAppLockStore.setState({error:'Could not authenticate. Check your phone security settings and retry.'});return false;}
    finally{prompt=null;useAppLockStore.setState({busy:false});}
  })();return prompt;
}
export async function unlockApp(){if(await verify())useAppLockStore.setState({locked:false,error:''});}
export async function setAppLockEnabled(enabled:boolean){
  if(Platform.OS==='web')throw new Error('Biometric app lock is available in the phone app.');
  if(enabled&&(!await LocalAuthentication.hasHardwareAsync()||!await LocalAuthentication.isEnrolledAsync()))throw new Error('Set up Face ID or fingerprint authentication in your phone settings first.');
  if(!await verify())return;
  try{
    if(enabled)await SecureStore.setItemAsync(preference,'enabled',{keychainAccessible:SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
    else await SecureStore.deleteItemAsync(preference);
    useAppLockStore.setState({loaded:true,enabled,locked:enabled&&AppState.currentState!=='active',obscured:enabled&&AppState.currentState!=='active',error:''});
  }catch{throw new Error('Could not save app-lock settings. Your previous setting remains active.');}
}
