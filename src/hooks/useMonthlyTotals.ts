import { useQuery } from '@tanstack/react-query';
import { startOfMonth, subMonths, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { effectiveDate, localMonthRange } from '../domain/transactionDates';
import { usePreferencesStore } from '../stores/usePreferencesStore';
import { TZDate } from '@date-fns/tz';
import { useEffect,useState } from 'react';
import { AppState } from 'react-native';

export interface MonthlyTotal {
  month: string;
  total: number;
}

export function useMonthlyTotals(monthsBack: number) {
  const profile=usePreferencesStore(s=>s.profile);const [clock,setClock]=useState(()=>new Date());
  useEffect(()=>{const tick=()=>setClock(new Date());const timer=setInterval(tick,30000);const listener=AppState.addEventListener('change',s=>{if(s==='active')tick();});return()=>{clearInterval(timer);listener.remove();};},[]);
  const today=profile?new TZDate(clock.getTime(),profile.timezone):clock;
  const earliestMonth = formatISO(startOfMonth(subMonths(today, monthsBack - 1)), {
    representation: 'date',
  });

  return useQuery({
    queryKey: profile ? ['monthlyTotals',earliestMonth,profile.user_id,profile.timezone] : ['monthlyTotals', earliestMonth],
    queryFn: async (): Promise<MonthlyTotal[]> => {
      if(profile){const end=formatISO(startOfMonth(subMonths(today,-1)),{representation:'date'});const result=await supabase.rpc('monthly_expense_totals',{p_start:earliestMonth,p_end:end});if(result.error)throw result.error;const values=new Map<string,number>((result.data??[]).map((r:{month:string;total:number})=>[r.month,Number(r.total)]));return Array.from({length:monthsBack},(_,i)=>{const month=formatISO(startOfMonth(subMonths(today,monthsBack-1-i)),{representation:'date'});return {month,total:values.get(month)??0};});}
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, occurred_at, transaction_date')
        .eq('type', 'expense')
        .or(`transaction_date.gte.${earliestMonth},and(transaction_date.is.null,occurred_at.gte.${localMonthRange(earliestMonth).start})`);

      if (error) throw error;

      const totalsByMonth = new Map<string, number>();
      for (const row of data) {
        const monthKey = `${effectiveDate(row).slice(0,7)}-01`;
        totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) ?? 0) + row.amount);
      }

      const months: MonthlyTotal[] = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthKey = formatISO(startOfMonth(subMonths(today, i)), { representation: 'date' });
        months.push({ month: monthKey, total: totalsByMonth.get(monthKey) ?? 0 });
      }

      return months;
    },
  });
}
