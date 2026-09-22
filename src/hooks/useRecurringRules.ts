import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import type { RecurringRule, RecurringFrequency } from '../types/database';
import { getDueOccurrences, computeNextOccurrence } from '../domain/recurring';

export function useRecurringRules() {
  return useQuery({
    queryKey: ['recurringRules'],
    queryFn: async (): Promise<RecurringRule[]> => {
      const { data, error } = await supabase.from('recurring_rules').select('*');

      if (error) throw error;
      return data;
    },
  });
}

async function materializeRule(rule: RecurringRule): Promise<void> {
  const dueDates = getDueOccurrences(
    new Date(rule.next_occurrence_date),
    rule.frequency,
    new Date()
  );

  if (dueDates.length === 0) return;

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  const rows = dueDates.map((date) => ({
    user_id: userData.user.id,
    category_id: rule.category_id,
    amount: rule.amount,
    note: rule.note,
    occurred_at: date.toISOString(),
    recurring_rule_id: rule.id,
  }));

  const { error: insertError } = await supabase.from('transactions').insert(rows);
  if (insertError) throw insertError;

  const lastDue = dueDates[dueDates.length - 1];
  const nextOccurrence = computeNextOccurrence(lastDue, rule.frequency);

  const { error: updateError } = await supabase
    .from('recurring_rules')
    .update({ next_occurrence_date: nextOccurrence.toISOString().slice(0, 10) })
    .eq('id', rule.id);

  if (updateError) throw updateError;
}

export function useRecurringCatchUp(): void {
  const queryClient = useQueryClient();
  const { data: rules } = useRecurringRules();

  const { mutate: runCatchUp } = useMutation({
    mutationFn: async (dueRules: RecurringRule[]) => {
      for (const rule of dueRules) {
        await materializeRule(rule);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });

  useEffect(() => {
    const activeRules = (rules ?? []).filter((rule) => rule.active);
    if (activeRules.length > 0) {
      runCatchUp(activeRules);
    }
  }, [rules, runCatchUp]);
}

export interface AddRecurringRuleInput {
  categoryId: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
}

export function useAddRecurringRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ categoryId, amount, note, frequency }: AddRecurringRuleInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('recurring_rules').insert({
        user_id: userData.user.id,
        category_id: categoryId,
        amount,
        note,
        frequency,
        next_occurrence_date: formatISO(new Date(), { representation: 'date' }),
        active: true,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });
}

export interface UpdateRecurringRuleInput {
  id: string;
  categoryId: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
}

export function useUpdateRecurringRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, categoryId, amount, note, frequency }: UpdateRecurringRuleInput) => {
      const { error } = await supabase
        .from('recurring_rules')
        .update({ category_id: categoryId, amount, note, frequency })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });
}

export function useSetRecurringRuleActive() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('recurring_rules').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurringRules'] });
    },
  });
}
