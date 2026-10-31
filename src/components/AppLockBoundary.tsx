import {useEffect,useState,type ReactNode} from 'react';
import {AppState,Modal,Platform,Text,View} from 'react-native';
import {LockKeyhole} from 'lucide-react-native';
import * as ScreenCapture from 'expo-screen-capture';
import {useAppLockStore} from '../stores/useAppLockStore';
import {initializeAppLock,handleLockAppState,unlockApp} from '../lib/appLock';
import {useColors,type} from '../styles/theme';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';
import {useUpdateBlocker} from '../stores/useUpdateSafetyStore';
let captureWork:Promise<unknown>=Promise.resolve();

export function AppLockBoundary({children}:{children:ReactNode}){
  const state=useAppLockStore(),colors=useColors(),form=useFormStyles();
  const hidden=!state.loaded||state.enabled&&(state.locked||state.obscured);
  const [mounted,setMounted]=useState(false);
  useUpdateBlocker(hidden||state.busy);
  useEffect(()=>{void initializeAppLock();const listener=AppState.addEventListener('change',handleLockAppState);return()=>listener.remove();},[]);
  if(!hidden&&!mounted)setMounted(true);
  useEffect(()=>{
    if(Platform.OS==='web'||!state.enabled)return;
    captureWork=captureWork.catch(()=>{}).then(async()=>{await ScreenCapture.preventScreenCaptureAsync('app-lock');if(Platform.OS==='ios')await ScreenCapture.enableAppSwitcherProtectionAsync();}).catch(()=>{});
    return()=>{captureWork=captureWork.catch(()=>{}).then(async()=>{await ScreenCapture.allowScreenCaptureAsync('app-lock');if(Platform.OS==='ios')await ScreenCapture.disableAppSwitcherProtectionAsync();}).catch(()=>{});};
  },[state.enabled]);
  const cover=<View accessibilityViewIsModal style={{flex:1,backgroundColor:colors.background,justifyContent:'center',padding:28,gap:20}}>
    <LockKeyhole size={36} color={colors.primary}/>
    <Text accessibilityRole="header" style={{...type.title,color:colors.text}}>Budget Tracker</Text>
    <Text style={form.subtitle}>{state.loaded?'Unlock with biometrics or your device passcode.':'Preparing secure access…'}</Text>
    {!!state.error&&<Text accessibilityRole="alert" style={form.error}>{state.error}</Text>}
    {state.loaded?<MotionPressable disabled={state.busy||state.obscured} style={form.button} onPress={()=>void unlockApp()}><Text style={form.buttonText}>{state.busy?'Authenticating…':'Unlock app'}</Text></MotionPressable>:!!state.error&&<MotionPressable style={form.button} onPress={()=>void initializeAppLock()}><Text style={form.buttonText}>Retry secure access</Text></MotionPressable>}
  </View>;
  return <View style={{flex:1}}>
    {(mounted||!hidden)&&<View style={{flex:1}} accessibilityElementsHidden={hidden} importantForAccessibility={hidden?'no-hide-descendants':'auto'} pointerEvents={hidden?'none':'auto'}>{children}</View>}
    {!mounted&&hidden?cover:<Modal visible={hidden} animationType="none" presentationStyle="fullScreen" onRequestClose={()=>{}}>{cover}</Modal>}
  </View>;
}
