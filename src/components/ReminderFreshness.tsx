import {useEffect,useState} from 'react';
import {useDateTimeFormatter} from '../hooks/useDateFormatter';
import {Platform,Text,View} from 'react-native';
import {useReminderFreshnessStore} from '../stores/useReminderFreshnessStore';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFormStyles} from '../styles/forms';
import type {ReminderFreshness as ReminderSnapshot} from '../stores/useReminderFreshnessStore';

function reminderCoverage(snapshot:ReminderSnapshot,timezone:string,times:string[],date:(value:string)=>string) {
 if(snapshot.timezone!==timezone)return 'Timezone changed. Refresh reminders before relying on the schedule.';
 if(snapshot.mode==='permission-denied')return 'Phone permission is off. No reminders are scheduled.';
 if(snapshot.mode==='disabled')return 'Bill reminders are off.';
 const plural=times.length===1?'':'s';
 const range=times.length?` · Next ${date(times[0])} · Last ${date(times[times.length-1])}`:'';
 return `${times.length} upcoming reminder${plural} scheduled${range}.`;
}

export function ReminderFreshness(){
  const date=useDateTimeFormatter();
  const profile=usePreferencesStore(s=>s.profile),status=useReminderFreshnessStore(),form=useFormStyles();
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(id);},[]);
  if(Platform.OS==='web'||!profile)return null;
  const own=status.owner===profile.user_id,snapshot=own?status.snapshot:null;
  const times=(snapshot?.scheduledAt??[]).filter(t=>Date.parse(t)>now);
  return <View style={{gap:8}}>
    <Text style={form.label}>Reminder sync on this phone</Text>
    <Text style={form.subtitle}>{snapshot?`Last successful sync: ${date(snapshot.syncedAt)}`:'No successful reminder sync recorded yet.'}</Text>
    {snapshot&&<Text style={form.subtitle}>{reminderCoverage(snapshot,profile.timezone,times,date)}</Text>}
    {own&&status.syncing&&<Text accessibilityLiveRegion="polite" style={form.subtitle}>Syncing phone reminders…</Text>}
    {own&&!!status.error&&<Text accessibilityRole="alert" style={form.error}>{status.error}</Text>}
    <Text style={form.subtitle}>Schedules cover at most 48 reminders within 30 days. Changes on another device need a new sync on this phone.</Text>
  </View>;
}
