import {useEffect} from 'react';
import {AppState,Platform} from 'react-native';
import {useQuery} from '@tanstack/react-query';
import {useRouter} from 'expo-router';
import * as Notifications from 'expo-notifications';
import {supabase} from '../lib/supabase';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {cancelPhoneReminders,reconcileBillReminders,serializeNotifications,type PhoneBill} from '../lib/phoneNotifications';
import {createRequestId} from '../domain/ocr';
import {useToastStore} from '../stores/useToastStore';
import {useUiStore} from '../stores/useUiStore';
import {isUuid} from '../../supabase/functions/ocr/shared';
export function usePhoneNotifications() {
  const profile=usePreferencesStore(s=>s.profile);const router=useRouter();
  const snapshot=useQuery({queryKey:['phoneReminders',profile?.user_id,profile?.timezone,profile?.bill_notifications],enabled:Platform.OS!=='web'&&!!profile?.bill_notifications,refetchInterval:60000,queryFn:async()=>{
    const r=await supabase.rpc('phone_notification_snapshot');if(r.error)throw r.error;
    return r.data as {owner:string;timezone:string;bills:PhoneBill[]};
  }});
  useEffect(()=>{
    if(Platform.OS==='web')return;
    if(!profile?.user_id||profile.bill_notifications===undefined)return;
    if(!profile.bill_notifications){void serializeNotifications(()=>cancelPhoneReminders(profile.user_id)).catch(()=>{});return;}
    if(snapshot.isFetching||snapshot.isError)return;
    if(snapshot.data?.owner!==profile.user_id||snapshot.data.timezone!==profile.timezone)return;
    void serializeNotifications(()=>reconcileBillReminders(profile.user_id,snapshot.data!.bills)).catch(()=>useToastStore.getState().showToast('Could not schedule bill reminders. Open phone notifications in Settings and refresh reminders.'));
  },[profile,snapshot.data,snapshot.dataUpdatedAt,snapshot.isFetching,snapshot.isError]);
  const refetch=snapshot.refetch;
  useEffect(()=>{if(Platform.OS==='web')return;const listener=AppState.addEventListener('change',s=>{if(s==='active'&&profile?.bill_notifications)void refetch();});return()=>listener.remove();},[profile?.bill_notifications,refetch]);
  useEffect(()=>{
    if(Platform.OS==='web')return;
    const open=(response:Notifications.NotificationResponse)=>{
      const data=response.notification.request.content.data;const owner=usePreferencesStore.getState().profile?.user_id;
      if(!owner)return;
      if(!data||data.owner!==owner){void Notifications.clearLastNotificationResponseAsync().catch(()=>{});return;}
      if(typeof data.month==='string'&&/^\d{4}-(0[1-9]|1[0-2])-01$/.test(data.month))useUiStore.getState().setSelectedMonth(data.month);
      if(data.kind==='bill'&&isUuid(data.ruleId))router.push({pathname:'/recurring/[id]',params:{id:data.ruleId as string,visit:createRequestId()}});
      else if(data.kind==='category'&&isUuid(data.categoryId))router.push({pathname:'/budget/[categoryId]',params:{categoryId:data.categoryId as string,visit:createRequestId()}});
      else if(data.kind==='monthly')router.push('/');
      void Notifications.clearLastNotificationResponseAsync().catch(()=>{});
    };
    const listener=Notifications.addNotificationResponseReceivedListener(open);
    const last=Notifications.getLastNotificationResponse();if(last&&profile?.user_id)open(last);
    return()=>listener.remove();
  },[profile?.user_id,router]);
}
