import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Transaction, TransactionType } from '../types/database';

function monthRange(month: string) {
  const start = new Date(`${month}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function useTransactions(month: string) {
  const { start, end } = monthRange(month);

  return useQuery({
    queryKey: ['transactions', month],
    queryFn: async (): Promise<Transaction[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('occurred_at', start)
        .lt('occurred_at', end)
        .order('occurred_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });
}

export interface AddTransactionInput {
  categoryId: string | null;
  amount: number;
  note: string | null;
  occurredAt: string;
  type: TransactionType;
}

interface AddTransactionContext {
  previousTransactions: Transaction[] | undefined;
}

export function useAddTransaction(month: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, AddTransactionInput, AddTransactionContext>({
    mutationFn: async ({ categoryId, amount, note, occurredAt, type }: AddTransactionInput) => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;

      const { error } = await supabase.from('transactions').insert({
        user_id: userData.user.id,
        category_id: categoryId,
        amount,
        note,
        occurred_at: occurredAt,
        type,
      });

      if (error) throw error;
    },
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', month] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(['transactions', month]);

      const optimisticTransaction: Transaction = {
        id: `optimistic-${Date.now()}`,
        user_id: '',
        category_id: newTransaction.categoryId,
        amount: newTransaction.amount,
        note: newTransaction.note,
        occurred_at: newTransaction.occurredAt,
        recurring_rule_id: null,
        type: newTransaction.type,
      };

      queryClient.setQueryData<Transaction[]>(['transactions', month], (old) => [
        optimisticTransaction,
        ...(old ?? []),
      ]);

      return { previousTransactions };
    },
    onError: (_err, _newTransaction, context) => {
      if (context) {
        queryClient.setQueryData(['transactions', month], context.previousTransactions);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] });
    },
  });
}

export interface UpdateTransactionInput {
  id: string;
  categoryId: string | null;
  amount: number;
  note: string | null;
  occurredAt: string;
  type: TransactionType;
}

interface UpdateTransactionContext {
  previousTransactions: Transaction[] | undefined;
}

export function useUpdateTransaction(month: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, UpdateTransactionInput, UpdateTransactionContext>({
    mutationFn: async ({ id, categoryId, amount, note, occurredAt, type }: UpdateTransactionInput) => {
      const { error } = await supabase
        .from('transactions')
        .update({ category_id: categoryId, amount, note, occurred_at: occurredAt, type })
        .eq('id', id);

      if (error) throw error;
    },
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['transactions', month] });
      const previousTransactions = queryClient.getQueryData<Transaction[]>(['transactions', month]);

      queryClient.setQueryData<Transaction[]>(['transactions', month], (old) =>
        (old ?? []).map((transaction) =>
          transaction.id === updated.id
            ? {
                ...transaction,
                category_id: updated.categoryId,
                amount: updated.amount,
                note: updated.note,
                occurred_at: updated.occurredAt,
                type: updated.type,
              }
            : transaction
        )
      );

      return { previousTransactions };
    },
    onError: (_err, _updated, context) => {
      if (context) {
        queryClient.setQueryData(['transactions', month], context.previousTransactions);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] });
    },
  });
}

export function useDeleteTransaction(month: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('transactions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', month] });
    },
  });
}
