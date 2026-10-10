import { useQuery } from '@tanstack/react-query';
import { startOfMonth, subMonths, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import { usePreferencesStore } from '../stores/usePreferencesStore';
import { TZDate } from '@date-fns/tz';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

export interface MonthlyTotal { month: string; total: number }

export function useMonthlyTotals(monthsBack: number) {
  const profile = usePreferencesStore(s => s.profile);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setClock(new Date());
    const timer = setInterval(tick, 30000);
    const listener = AppState.addEventListener('change', s => { if (s === 'active') tick(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, []);
  const today = profile ? new TZDate(clock.getTime(), profile.timezone) : clock;
  const monthKey = (offset: number) => formatISO(startOfMonth(subMonths(today, offset)), { representation: 'date' });
  const earliestMonth = monthKey(monthsBack - 1);
  const end = monthKey(-1);
  return useQuery({
    queryKey: ['monthlyTotals', earliestMonth, profile?.user_id, profile?.timezone, monthsBack],
    enabled: !!profile,
    queryFn: async (): Promise<MonthlyTotal[]> => {
      const result = await supabase.rpc('monthly_expense_totals', { p_start: earliestMonth, p_end: end });
      if (result.error) throw result.error;
      const values = new Map<string, number>((result.data ?? []).map((r: { month: string; total: number }) => [r.month, Number(r.total)]));
      return Array.from({ length: monthsBack }, (_, i) => {
        const month = monthKey(monthsBack - 1 - i);
        const total = values.get(month) ?? 0;
        if (!Number.isFinite(total) || total < 0 || !Number.isSafeInteger(Math.round(total * 100))) throw new Error('The monthly total is outside the supported range.');
        return { month, total };
      });
    },
  });
}
