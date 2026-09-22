import { useQuery } from '@tanstack/react-query';
import { startOfMonth, subMonths, formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';

export interface MonthlyTotal {
  month: string;
  total: number;
}

export function useMonthlyTotals(monthsBack: number) {
  const earliestMonth = formatISO(startOfMonth(subMonths(new Date(), monthsBack - 1)), {
    representation: 'date',
  });

  return useQuery({
    queryKey: ['monthlyTotals', earliestMonth],
    queryFn: async (): Promise<MonthlyTotal[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('amount, occurred_at')
        .gte('occurred_at', `${earliestMonth}T00:00:00.000Z`);

      if (error) throw error;

      const totalsByMonth = new Map<string, number>();
      for (const row of data) {
        const monthKey = formatISO(startOfMonth(new Date(row.occurred_at)), { representation: 'date' });
        totalsByMonth.set(monthKey, (totalsByMonth.get(monthKey) ?? 0) + row.amount);
      }

      const months: MonthlyTotal[] = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const monthKey = formatISO(startOfMonth(subMonths(new Date(), i)), { representation: 'date' });
        months.push({ month: monthKey, total: totalsByMonth.get(monthKey) ?? 0 });
      }

      return months;
    },
  });
}
