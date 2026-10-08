import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {alertMessage,budgetAlertLevels,type BudgetAlertInput} from '../domain/budgetNotifications';
import {formatMoney} from '../domain/money';

if(Platform.OS!=='web')Notifications.setNotificationHandler({handleNotification:()=>Promise.resolve({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
let work:Promise<unknown>=Promise.resolve();
export function serializeNotifications(task:()=>Promise<void>) {
  const next=work.catch(()=>{}).then(task);work=next;return next;
}
export async function phonePermission(request=false) {
  if(Platform.OS==='web')return false;
  if(Platform.OS==='android') {
    await Notifications.setNotificationChannelAsync('budget-alerts',{name:'Budget alerts',importance:Notifications.AndroidImportance.DEFAULT});
    await Notifications.setNotificationChannelAsync('bill-reminders',{name:'Bill reminders',importance:Notifications.AndroidImportance.DEFAULT});
  }
  let result=await Notifications.getPermissionsAsync();
  if(request&&!result.granted&&result.canAskAgain)result=await Notifications.requestPermissionsAsync();
  return result.granted||result.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;
}
export async function cancelPhoneReminders(owner?:string) {
  if(Platform.OS==='web')return;
  const pending=await Notifications.getAllScheduledNotificationsAsync();
  for(const item of pending)if(item.content.data?.kind==='bill'&&(!owner||item.content.data?.owner===owner))await Notifications.cancelScheduledNotificationAsync(item.identifier);
}
export async function sendBudgetAlerts(owner:string,input:BudgetAlertInput) {
  const profile=usePreferencesStore.getState().profile;
  if(profile?.user_id!==owner||!profile.budget_notifications||!await phonePermission())return;
  const rows=budgetAlertLevels(input);if(!rows.length)return;
  const key=`budget-alerts:${owner}:${input.month}`;
  const stored=await AsyncStorage.getItem(key);
  const initialized=await AsyncStorage.getItem(`budget-alerts:${owner}:initialized`);
  let previous:Record<string,number>|null=null;
  try {previous=stored?JSON.parse(stored):initialized?{}:null;} catch {previous=null;}
  const levels={...(previous??{})};
  for(const row of rows) {
    const baseline=previous===null?undefined:previous[row.id]??0;
    if(baseline!==undefined&&row.level>baseline&&row.level>0) {
      const current=usePreferencesStore.getState().profile;
      if(current?.user_id!==owner||!current.budget_notifications)return;
      const name=current.notification_private!==false?(row.id==='monthly'?'Your monthly budget':'A category budget'):row.name;
      await Notifications.scheduleNotificationAsync({identifier:`budget:${owner}:${input.month}:${row.id}:${row.level}`,content:{title:'Budget alert',body:alertMessage(name,row.spent,row.limit,row.level),sound:'default',data:{owner,kind:row.id==='monthly'?'monthly':'category',categoryId:row.id==='monthly'?null:row.id,month:input.month}},trigger:Platform.OS==='android'?{channelId:'budget-alerts'}:null});
    }
    levels[row.id]=Math.max(baseline??0,row.level);
  }
  await AsyncStorage.setItem(key,JSON.stringify(levels));
  await AsyncStorage.setItem(`budget-alerts:${owner}:initialized`,'1');
}
export interface PhoneBill {id:string;rule_id:string;reminder_at:string;label:string|null;amount:number;scheduled_date:string}
export async function reconcileBillReminders(owner:string,bills:PhoneBill[]) {
  const profile=usePreferencesStore.getState().profile;
  if(Platform.OS==='web'||profile?.user_id!==owner)return;
  const permitted=profile.bill_notifications&&await phonePermission();
  const wanted=new Map((permitted?bills:[]).filter(b=>new Date(b.reminder_at).getTime()>Date.now()).slice(0,48).map(b=>[`bill:${owner}:${b.id}`,b]));
  const pending=await Notifications.getAllScheduledNotificationsAsync();
  const existing=new Map<string,Notifications.NotificationRequest>();
  for(const item of pending)if(item.content.data?.kind==='bill') {
    const bill=wanted.get(item.identifier);
    const fingerprint=bill?JSON.stringify([bill.reminder_at,bill.label,bill.amount,profile.currency,profile.notification_private!==false]):'';
    if(item.content.data?.owner!==owner||!bill||item.content.data?.fingerprint!==fingerprint)await Notifications.cancelScheduledNotificationAsync(item.identifier);
    else existing.set(item.identifier,item);
  }
  for(const [identifier,bill] of wanted)if(!existing.has(identifier)) {
    const current=usePreferencesStore.getState().profile;
    if(current?.user_id!==owner||!current.bill_notifications)return;
    const fingerprint=JSON.stringify([bill.reminder_at,bill.label,bill.amount,profile.currency,profile.notification_private!==false]);
    await Notifications.scheduleNotificationAsync({identifier,content:{title:'Recurring bill reminder',body:profile.notification_private!==false?'A recurring bill is coming due. Open the app for details.':`${bill.label||'Recurring bill'} · ${formatMoney(Number(bill.amount),profile.currency)} due ${bill.scheduled_date}.`,sound:'default',data:{owner,kind:'bill',ruleId:bill.rule_id,occurrenceId:bill.id,fingerprint}},trigger:{type:Notifications.SchedulableTriggerInputTypes.DATE,date:new Date(bill.reminder_at),channelId:'bill-reminders'}});
  }
}
