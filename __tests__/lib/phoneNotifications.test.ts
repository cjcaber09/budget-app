import AsyncStorage from '@react-native-async-storage/async-storage';
import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import {phonePermission,sendBudgetAlerts,reconcileBillReminders,cancelPhoneReminders,type PhoneBill} from '../../src/lib/phoneNotifications';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {alertMessage,budgetAlertLevels} from '../../src/domain/budgetNotifications';
const mockSchedule=jest.fn().mockResolvedValue('id');const mockCancel=jest.fn().mockResolvedValue(undefined);const mockPending=jest.fn().mockResolvedValue([]);const mockPermission=jest.fn().mockResolvedValue({granted:true});
jest.mock('expo-notifications',()=>({setNotificationHandler:jest.fn(),setNotificationChannelAsync:jest.fn().mockResolvedValue(undefined),AndroidImportance:{DEFAULT:3},getPermissionsAsync:()=>mockPermission(),requestPermissionsAsync:jest.fn().mockResolvedValue({granted:true}),IosAuthorizationStatus:{PROVISIONAL:3},scheduleNotificationAsync:(value:unknown)=>mockSchedule(value),getAllScheduledNotificationsAsync:()=>mockPending(),cancelScheduledNotificationAsync:(id:string)=>mockCancel(id),SchedulableTriggerInputTypes:{DATE:'date'}}));
const owner='owner';const originalOS=Platform.OS;
const input={month:'2026-10-01',currentMonth:'2026-10-01',limitCents:10000,expenseCents:7000,categories:[{id:'groceries',name:'Groceries',spent:7000,limit:10000}]};
const bill:PhoneBill={id:'o',rule_id:'r',reminder_at:'2099-10-08T01:00:00Z',label:'Rent',amount:100,scheduled_date:'2099-10-09'};
beforeEach(async()=>{jest.clearAllMocks();mockPending.mockResolvedValue([]);mockPermission.mockResolvedValue({granted:true});mockSchedule.mockResolvedValue('id');await AsyncStorage.clear();Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});usePreferencesStore.getState().setProfile({user_id:owner,display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC',budget_notifications:true,bill_notifications:true,notification_private:false});});
afterEach(()=>{usePreferencesStore.getState().setProfile(null);Object.defineProperty(Platform,'OS',{value:originalOS,configurable:true});});
it('baselines existing spending, persists80/100 alerts, and never repeats after refunds/restarts',async()=>{
 await sendBudgetAlerts(owner,input);expect(mockSchedule).not.toHaveBeenCalled();
 await sendBudgetAlerts(owner,{...input,expenseCents:8000,categories:[{...input.categories[0],spent:8000}]});expect(mockSchedule).toHaveBeenCalledTimes(2);
 await sendBudgetAlerts(owner,{...input,expenseCents:10000,categories:[{...input.categories[0],spent:10000}]});expect(mockSchedule).toHaveBeenCalledTimes(4);
 expect(mockSchedule.mock.calls[3][0].content.body).toBe('Groceries has reached its limit.');
 await sendBudgetAlerts(owner,input);await sendBudgetAlerts(owner,{...input,expenseCents:12000,categories:[{...input.categories[0],spent:12000}]});expect(mockSchedule).toHaveBeenCalledTimes(4);
});
it('a jump to110 sends only100 alerts and historical browsing does not notify',async()=>{
 await sendBudgetAlerts(owner,input);await sendBudgetAlerts(owner,{...input,expenseCents:11000,categories:[{...input.categories[0],spent:11000}]});expect(mockSchedule).toHaveBeenCalledTimes(2);expect(mockSchedule.mock.calls[1][0].content.body).toContain('exceeded');
 await sendBudgetAlerts(owner,{...input,month:'2026-09-01'});expect(mockSchedule).toHaveBeenCalledTimes(2);
 expect(budgetAlertLevels({...input,limitCents:0,categories:[]})).toEqual([]);
 expect(alertMessage('Budget',10000,10000,100)).toContain('reached');
});
it('denied permission and account mismatch cannot notify or mark thresholds',async()=>{
 mockPermission.mockResolvedValue({granted:false,canAskAgain:false});await sendBudgetAlerts(owner,input);expect(AsyncStorage.setItem).not.toHaveBeenCalled();await sendBudgetAlerts('other',input);expect(mockSchedule).not.toHaveBeenCalled();
});
it('creates Android channels before asking permission and allows iOS provisional alerts',async()=>{
 Object.defineProperty(Platform,'OS',{value:'android',configurable:true});mockPermission.mockResolvedValue({granted:false,canAskAgain:true});expect(await phonePermission(true)).toBe(true);expect(Notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(2);
 Object.defineProperty(Platform,'OS',{value:'ios',configurable:true});mockPermission.mockResolvedValue({granted:false,ios:{status:3}});expect(await phonePermission()).toBe(true);
});
it('reconciles reminder changes and removes settled, skipped and previous-account reminders',async()=>{
 await reconcileBillReminders(owner,[bill]);expect(mockSchedule).toHaveBeenCalledTimes(1);const request=mockSchedule.mock.calls[0][0];mockPending.mockResolvedValue([{identifier:request.identifier,content:request.content}]);
 await reconcileBillReminders(owner,[bill]);expect(mockSchedule).toHaveBeenCalledTimes(1);
 await reconcileBillReminders(owner,[{...bill,reminder_at:'2099-10-08T02:00:00Z'}]);expect(mockCancel).toHaveBeenCalledWith('bill:owner:o');expect(mockSchedule).toHaveBeenCalledTimes(2);
 await reconcileBillReminders(owner,[]);expect(mockCancel).toHaveBeenCalledTimes(2);
 await cancelPhoneReminders(owner);expect(mockCancel).toHaveBeenCalledTimes(3);
});
it('hides financial details by default and avoids scheduling past reminders',async()=>{
 usePreferencesStore.getState().setProfile({...usePreferencesStore.getState().profile!,notification_private:true});await reconcileBillReminders(owner,[bill,{...bill,id:'past',reminder_at:'2000-01-01T00:00:00Z'}]);expect(mockSchedule).toHaveBeenCalledTimes(1);expect(mockSchedule.mock.calls[0][0].content.body).not.toContain('Rent');
});

it('starts new-month thresholds at zero after the first opt-in baseline',async()=>{
 await sendBudgetAlerts(owner,input);await sendBudgetAlerts(owner,{...input,month:'2026-11-01',currentMonth:'2026-11-01',expenseCents:11000,categories:[{...input.categories[0],spent:8500}]});expect(mockSchedule).toHaveBeenCalledTimes(2);
});
