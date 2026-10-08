import {useEffect,useState} from 'react';
import {AppState,Linking,Platform,Switch,Text,View} from 'react-native';
import * as Notifications from 'expo-notifications';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useUpdateProfile} from '../hooks/useProfile';
import {phonePermission} from '../lib/phoneNotifications';
import {MotionPressable} from './MotionPressable';
import {useFormStyles} from '../styles/forms';
import {useColors,type} from '../styles/theme';
import {useQueryClient} from '@tanstack/react-query';
export function NotificationSettings() {
  const profile=usePreferencesStore(s=>s.profile);const update=useUpdateProfile();const styles=useFormStyles();const colors=useColors();
  const client=useQueryClient();
  const [allowed,setAllowed]=useState<boolean|null>(null);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  useEffect(()=>{let active=true;const check=()=>{void phonePermission().then(v=>{if(active)setAllowed(v);}).catch(()=>{if(active)setAllowed(false);});};check();const listener=AppState.addEventListener('change',s=>{if(s==='active')check();});return()=>{active=false;listener.remove();};},[]);
  if(!profile)return null;
  const change=async(key:'budget_notifications'|'bill_notifications'|'notification_private',value:boolean)=>{
    if(busy||update.isPending)return;setBusy(true);setError('');const owner=profile.user_id;
    try {
      if(value&&key!=='notification_private'){const permitted=await phonePermission(true);setAllowed(permitted);if(!permitted)throw Error('Phone notifications are disabled. Allow them in your phone settings.');}
      if(usePreferencesStore.getState().profile?.user_id!==owner)return;
      await update.mutateAsync({[key]:value});
    }catch(e){setError(e instanceof Error?e.message:'Could not save notification settings. Try again.');}finally{setBusy(false);}
  };
  return <View style={{gap:16}}>
    <Text accessibilityRole="header" style={{...type.heading,color:colors.text}}>Phone notifications</Text>
    <Text style={{...type.body,color:colors.muted}}>{Platform.OS==='web'?'Configure and test notifications in the phone app.':allowed===null?'Checking phone permission…':allowed?'Phone notifications are allowed.':'Phone notifications are disabled.'}</Text>
    {([['budget_notifications','Budget alerts'],['bill_notifications','Bill reminders'],['notification_private','Hide details on lock screen']] as const).map(([key,label])=><View key={key} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16}}><Text style={{...type.body,color:colors.text,flex:1}}>{label}</Text><Switch trackColor={{false:colors.border,true:colors.primary}} thumbColor={colors.surface} accessibilityLabel={label} value={key==='notification_private'?profile[key]!==false:!!profile[key]} disabled={Platform.OS==='web'||busy||update.isPending} onValueChange={v=>void change(key,v)}/></View>)}
    <Text style={{...type.body,color:colors.muted}}>Budget alerts check 80% and 100% when spending syncs. Existing spending is not announced when you first enable alerts. Bill reminders use your financial timezone. Up to 48 upcoming reminders are scheduled for the next 30 days and refresh when you open the app. Your phone may delay delivery.</Text>
    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {Platform.OS!=='web'&&<View>
      {profile.bill_notifications&&<MotionPressable style={styles.secondaryButton} onPress={()=>void client.invalidateQueries({queryKey:['phoneReminders']})}><Text style={styles.chipTextSelected}>Refresh bill reminders</Text></MotionPressable>}
      {!allowed&&<MotionPressable style={styles.secondaryButton} onPress={()=>{void Linking.openSettings().catch(()=>setError('Open your phone settings and allow notifications for Budget Tracker.'));}}><Text style={styles.chipTextSelected}>Open phone settings</Text></MotionPressable>}
      <MotionPressable style={styles.secondaryButton} disabled={busy} onPress={()=>{setBusy(true);setError('');void (async()=>{if(!await phonePermission(true))throw Error('Allow phone notifications first.');await Notifications.scheduleNotificationAsync({content:{title:'Budget Tracker',body:'Phone notifications are working.',sound:'default'},trigger:Platform.OS==='android'?{channelId:'budget-alerts'}:null});setAllowed(true);})().catch(e=>setError(e instanceof Error?e.message:'Could not send a test notification.')).finally(()=>setBusy(false));}}><Text style={styles.chipTextSelected}>Send test notification</Text></MotionPressable>
    </View>}
  </View>;
}
