import {invalidateReports} from '../lib/reportCache';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Budget } from '../types/database';
import {decimalToCents,centsToDecimal} from '../../supabase/functions/ocr/shared';

export function useBudgets(month: string, enabled = true) {
  return useQuery({
    queryKey: ['budgets', month],
    enabled,
    queryFn: async (): Promise<Budget[]> => {
      const rows:Budget[]=[];
      for(let start=0;;start+=1000){
        const {data,error}=await supabase.from('budgets').select('*').eq('month',month).order('id').range(start,start+999);
        if(error)throw error;
        rows.push(...data);
        if(data.length<1000)return rows;
      }
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
      const cents=decimalToCents(amount);
      if(cents===null||cents<0)throw new Error('Enter a valid category budget.');
      const {error}=await supabase.rpc('set_category_budget',{p_category:categoryId,p_month:month,p_amount:centsToDecimal(cents)});
      if(error)throw new Error(error.code==='22023'?error.message:'Could not save this budget. Your draft is still here; retry.');
    },
    onSuccess: (_data, variables) => {
      invalidateReports(queryClient);
      queryClient.invalidateQueries({ queryKey: ['budgets', variables.month] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
