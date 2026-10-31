import {useState} from 'react';
import {Platform,Switch,Text,View} from 'react-native';
import {useAppLockStore} from '../stores/useAppLockStore';
import {setAppLockEnabled,lockApp} from '../lib/appLock';
import {useFormStyles} from '../styles/forms';
import {MotionPressable} from './MotionPressable';
import {useColors,type} from '../styles/theme';

export function SecuritySettings(){
  const state=useAppLockStore(),form=useFormStyles(),colors=useColors(),[error,setError]=useState(''),[saving,setSaving]=useState(false);
  return <View style={{gap:12}}>
    <Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>Privacy & security</Text>
    <View style={{flexDirection:'row',alignItems:'center',gap:16}}><Text style={[form.subtitle,{flex:1}]}>Biometric app lock</Text><Switch accessibilityLabel="Biometric app lock" value={state.enabled} disabled={Platform.OS==='web'||saving||state.busy||!state.loaded} onValueChange={async value=>{setSaving(true);setError('');try{await setAppLockEnabled(value);}catch(e){setError(e instanceof Error?e.message:'Could not change app lock.');}finally{setSaving(false);}}}/></View>
    <Text style={form.subtitle}>{Platform.OS==='web'?'Biometric lock is available in the phone app.':'Locks when the app leaves the foreground. Your phone can offer its device passcode if biometrics are unavailable.'}</Text>
    {state.enabled&&<MotionPressable style={form.secondaryButton} onPress={lockApp}><Text style={form.chipTextSelected}>Lock now</Text></MotionPressable>}
    <Text style={form.subtitle}>Local sessions, transaction drafts and saved form choices are encrypted. {Platform.OS==='web'?'This browser keeps a non-extractable encryption key; it does not provide the phone’s hardware protection.':'The encryption key is kept in your phone’s secure storage.'}</Text>
    {!!(error||state.error)&&<Text accessibilityRole="alert" style={form.error}>{error||state.error}</Text>}
  </View>;
}
