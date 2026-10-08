import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Transaction, TransactionType } from '../types/database';
import { centsToDecimal, decimalToCents, sumItemCents, validItem, isUuid, MAX_MONEY_CENTS, type TransactionItemInput, type PaymentDetails } from '../../supabase/functions/ocr/shared';
import { createRequestId } from '../domain/ocr';
import { monthFilter, effectiveDate } from '../domain/transactionDates';
import { usePreferencesStore } from '../stores/usePreferencesStore';
import { transactionListKey } from '../domain/queryKeys';

interface ListSnapshot { key: QueryKey; data: Transaction[] | undefined }
function listSnapshots(client:QueryClient,targetMonth:string):ListSnapshot[] {
  const snapshots=client.getQueriesData<Transaction[]>({queryKey:['transactions']}).map(([key,data])=>({key,data}));
  const key=transactionListKey(targetMonth);
  if (!snapshots.some(entry=>JSON.stringify(entry.key)===JSON.stringify(key))) snapshots.push({key,data:undefined});
  return snapshots;
}
function restoreLists(client:QueryClient,snapshots:ListSnapshot[]) {
  for (const snapshot of snapshots) {
    if(snapshot.data===undefined) client.removeQueries({queryKey:snapshot.key,exact:true});
    else client.setQueryData(snapshot.key,snapshot.data);
  }
}

export function useTransaction(id: string) {
  return useQuery({ queryKey: ['transaction', id], enabled: isUuid(id), refetchOnMount: 'always', queryFn: async (): Promise<Transaction> => {
    const { data, error } = await supabase.from('transactions').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  }});
}
export function useTransactionItems(id: string) {
  return useQuery({ queryKey: ['transactionItems', id], enabled: isUuid(id), refetchOnMount: 'always', queryFn: async (): Promise<TransactionItemInput[]> => {
    const { data, error } = await supabase.from('transaction_items').select('*').eq('transaction_id', id).order('position');
    if (error) throw error;
    const items: TransactionItemInput[] = data.map(row => ({ kind: row.kind, label: row.label, amountCents: decimalToCents(row.amount)!,
      quantity: row.quantity === null ? null : String(row.quantity), unitPriceCents: row.unit_price === null ? null : decimalToCents(row.unit_price), taxIncluded: row.tax_included,
      affectsTotal: row.affects_total ?? true, isPaymentSummary: row.is_payment_summary ?? false, feeParty: row.fee_party ?? null }));
    if (items.length > 100 || !items.every(validItem)) throw new Error('Saved items could not be read. Please reload.');
    return items;
  }});
}

function inputAmount(input: AddTransactionInput): number {
  return input.items?.length ? sumItemCents(input.items,input.type) / 100 : input.amount;
}
async function saveTransaction(operation: 'create' | 'update', input: AddTransactionInput & { id?: string }): Promise<Transaction> {
  const items = input.items ?? [];
  if (items.length > 100 || !items.every(validItem)) throw new Error('Review the item fields before saving.');
  const cents = items.length ? sumItemCents(items,input.type) : decimalToCents(input.amount);
  if (cents === null || cents <= 0 || cents > MAX_MONEY_CENTS) throw new Error('Amount must be positive and in range.');
  const payload = {
    p_transaction: { operation, payload_version: 3, id: input.id ?? createRequestId(), type: input.type, category_id: input.categoryId,
      amount: centsToDecimal(cents), note: input.note, occurred_at: input.occurredAt,
      ...(input.transactionDate !== undefined ? { transaction_date: input.transactionDate } : {}),
      ...(input.paymentMethodId !== undefined ? { payment_method_id: input.paymentMethodId } : {}),
      ...(input.paymentDetails !== undefined ? { payment_details: input.paymentDetails } : {}) },
    p_items: items.map(row => ({ kind: row.kind, label: row.label.trim(), amount: centsToDecimal(row.amountCents),
      quantity: row.quantity, unit_price: row.unitPriceCents === null ? null : centsToDecimal(row.unitPriceCents), tax_included: row.taxIncluded,
      affects_total: row.affectsTotal ?? true, is_payment_summary: row.isPaymentSummary ?? false, fee_party: row.feeParty ?? null })),
  };
  const result = input.occurrenceId ? await supabase.rpc('bill_command',{p_occurrence:input.occurrenceId,p_command:operation==='create'?'record':input.type==='income'?'convert_income':'edit',p_transaction:payload.p_transaction,p_items:payload.p_items,p_confirm_difference:input.confirmDifference??false}) : await supabase.rpc('save_transaction',payload);
  const {error}=result;const data=input.occurrenceId ? result.data?.transaction : result.data;
  if (error) {
    const message = error.code === '23505' ? 'This transaction was already saved with different details. Reopen it to edit.'
      : ['22023', '23514', '23503'].includes(error.code) ? 'Review the category, amount and item rows before saving.'
      : error.code === '42501' ? 'This transaction is unavailable. Sign in and reopen it.'
      : 'Could not save the transaction. Your draft is still here; please retry.';
    throw new Error(message);
  }
  const saved = (Array.isArray(data) ? data[0] : data) as Transaction | null;
  if (!saved || typeof saved.id !== 'string' || !Number.isFinite(Number(saved.amount))) {
    throw new Error('The save response was incomplete. Retry this draft to confirm it was saved.');
  }
  return { ...saved, amount: Number(saved.amount) };
}

export function useTransactions(month: string) {
  const profile=usePreferencesStore(s=>s.profile);

  return useQuery({
    queryKey: transactionListKey(month),
    queryFn: async (): Promise<Transaction[]> => {
      const rows:Transaction[]=[];
      for(let start=0;;start+=1000){const {data,error}=await supabase.from('transactions').select('*').or(monthFilter(month,profile?.timezone)).order('occurred_at',{ascending:false}).order('id',{ascending:false}).range(start,start+999);if(error)throw error;rows.push(...data);if(data.length<1000)break;}
      return rows.sort((a,b) => effectiveDate(b).localeCompare(effectiveDate(a)) || b.occurred_at.localeCompare(a.occurred_at));
    },
  });
}

export interface AddTransactionInput {
  paymentMethodId?:string|null;
  occurrenceId?:string;
  confirmDifference?:boolean;
  transactionDate?: string | null;
  paymentDetails?: PaymentDetails | null;
  id?: string;
  items?: TransactionItemInput[];
  categoryId: string | null;
  amount: number;
  note: string | null;
  occurredAt: string;
  type: TransactionType;
}

interface AddTransactionContext {
  snapshots: ListSnapshot[];
}

export function useAddTransaction(_month: string) {
  const queryClient = useQueryClient();

  return useMutation<Transaction, Error, AddTransactionInput, AddTransactionContext>({
    mutationFn: input => saveTransaction('create', input),
    onMutate: async (newTransaction) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      const targetMonth=`${effectiveDate({transaction_date:newTransaction.transactionDate,occurred_at:newTransaction.occurredAt}).slice(0,7)}-01`;
      const snapshots=listSnapshots(queryClient,targetMonth);

      const optimisticTransaction: Transaction = {
        id: newTransaction.id ?? `optimistic-${Date.now()}`,
        user_id: '',
        category_id: newTransaction.categoryId,
        amount: inputAmount(newTransaction),
        note: newTransaction.note,
        occurred_at: newTransaction.occurredAt,
        recurring_rule_id: null,
        type: newTransaction.type,
        transaction_date: newTransaction.transactionDate,
        payment_details: newTransaction.paymentDetails,
        payment_method_id: newTransaction.paymentMethodId??null,
      };

      queryClient.setQueryData<Transaction[]>(transactionListKey(targetMonth), (old) => [
        optimisticTransaction,
        ...(old ?? []).filter(row=>row.id!==optimisticTransaction.id),
      ]);

      return { snapshots };
    },
    onError: (_err, _newTransaction, context) => {
      if (context) {
        restoreLists(queryClient,context.snapshots);
      }
    },
    onSettled: () => { void queryClient.invalidateQueries({queryKey:['transactions']}); },
    onSuccess: saved => {
      queryClient.setQueryData(['transaction', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['transaction', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['transactionItems', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyTotals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
      queryClient.invalidateQueries({ queryKey: ['phoneReminders'] });
    },
  });
}

export interface UpdateTransactionInput {
  paymentMethodId?:string|null;
  occurrenceId?:string;
  confirmDifference?:boolean;
  transactionDate?: string | null;
  paymentDetails?: PaymentDetails | null;
  items?: TransactionItemInput[];
  id: string;
  categoryId: string | null;
  amount: number;
  note: string | null;
  occurredAt: string;
  type: TransactionType;
}

interface UpdateTransactionContext {
  snapshots: ListSnapshot[];
}

export function useUpdateTransaction(_month: string) {
  const queryClient = useQueryClient();

  return useMutation<Transaction, Error, UpdateTransactionInput, UpdateTransactionContext>({
    mutationFn: input => saveTransaction('update', input),
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: ['transactions'] });
      const cached=queryClient.getQueriesData<Transaction[]>({queryKey:['transactions']});
      const original=queryClient.getQueryData<Transaction>(['transaction',updated.id]) ?? cached.flatMap(([,rows])=>rows??[]).find(row=>row.id===updated.id);
      const transactionDate=updated.transactionDate===undefined ? original?.transaction_date : updated.transactionDate;
      const targetMonth=`${effectiveDate({transaction_date:transactionDate,occurred_at:updated.occurredAt}).slice(0,7)}-01`;
      const snapshots=listSnapshots(queryClient,targetMonth);
      if(original) {
        const optimistic={...original,category_id:updated.categoryId,amount:inputAmount(updated),note:updated.note,occurred_at:updated.occurredAt,type:updated.type,
          transaction_date:transactionDate,payment_details:updated.paymentDetails===undefined ? original.payment_details : updated.paymentDetails,
          payment_method_id:updated.paymentMethodId===undefined?original.payment_method_id:updated.paymentMethodId};
        for(const snapshot of snapshots) queryClient.setQueryData<Transaction[]>(snapshot.key,()=>{
          const rows=(snapshot.data??[]).filter(row=>row.id!==updated.id);
          return JSON.stringify(snapshot.key)===JSON.stringify(transactionListKey(targetMonth)) ? [optimistic,...rows] : rows;
        });
      }
      return { snapshots };
    },
    onError: (_err, _updated, context) => {
      if (context) {
        restoreLists(queryClient,context.snapshots);
      }
    },
    onSettled: () => { void queryClient.invalidateQueries({queryKey:['transactions']}); },
    onSuccess: saved => {
      queryClient.setQueryData(['transaction', saved.id], saved);
      queryClient.invalidateQueries({ queryKey: ['transaction', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['transactionItems', saved.id] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyTotals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
      queryClient.invalidateQueries({ queryKey: ['phoneReminders'] });
    },
  });
}

export function useDeleteTransaction(month: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const row=queryClient.getQueryData<Transaction>(['transaction',id]) ?? queryClient.getQueriesData<Transaction[]>({queryKey:['transactions']}).flatMap(([,rows])=>rows??[]).find(t=>t.id===id);
      if(row?.occurrence_id) {const result=await supabase.rpc('bill_command',{p_occurrence:row.occurrence_id,p_command:'skip'});if(result.error)throw result.error;return;}
      const { error } = await supabase.rpc('delete_transaction',{p_id:id});
      if (error) throw error;
    },
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ['transaction', id] });
      queryClient.removeQueries({ queryKey: ['transactionItems', id] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['monthlyTotals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['paymentMethods'] });
      queryClient.invalidateQueries({ queryKey: ['phoneReminders'] });
    },
  });
}
