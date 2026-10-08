import {useEffect} from 'react';
import {Platform} from 'react-native';
import {useDashboard} from './useDashboard';
import {useBudgets} from './useBudgets';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {localDateKey} from '../domain/transactionDates';
import {decimalToCents} from '../../supabase/functions/ocr/shared';
import {sendBudgetAlerts,serializeNotifications} from '../lib/phoneNotifications';
export function useBudgetAlerts(_browsedMonth:string):void {
  const profile=usePreferencesStore(s=>s.profile);
  const month=localDateKey(new Date(),profile?.timezone).slice(0,7)+'-01';
  const enabled=Platform.OS!=='web'&&!!profile?.budget_notifications;
  const snapshot=useDashboard(month,enabled);const budgets=useBudgets(month,enabled);
  useEffect(()=>{
    const data=snapshot.data;
    if(Platform.OS==='web'||!profile?.budget_notifications||!data?.complete||snapshot.isError||budgets.isError||snapshot.isFetching||budgets.isFetching||!budgets.data||data.timezone!==profile.timezone)return;
    void serializeNotifications(()=>sendBudgetAlerts(profile.user_id,{month:data.month,currentMonth:month,expenseCents:data.expenseCents,limitCents:data.limitCents,categories:data.categoryTotals.map(c=>({...c,limit:decimalToCents(budgets.data!.find(b=>b.category_id===c.id)?.amount??0)??0}))})).catch(()=>console.warn('Budget notification could not be scheduled.'));
  },[profile,month,snapshot.data,snapshot.isError,snapshot.isFetching,budgets.data,budgets.isError,budgets.isFetching]);
}
