import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Budget } from '../types/database';

export function useBudgets(month: string) {
  return useQuery({
    queryKey: ['budgets', month],
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase.from('budgets').select('*').eq('month', month);
      if (error) throw error;
      return data;
    },
  });
}

export interface SetBudgetInput {
  categoryId: string;
  month: string;
  amount: number;
}

export function useSetBudget() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ categoryId, month, amount }: SetBudgetInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('budgets').upsert(
        {
          user_id: userData.user.id,
          category_id: categoryId,
          month,
          amount,
        },
        { onConflict: 'user_id,category_id,month' }
      );

      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budgets', variables.month] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
