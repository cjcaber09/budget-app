import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { formatISO, startOfMonth } from 'date-fns';
import type { PropsWithChildren } from 'react';
import { useMonthlyTotals } from '../../src/hooks/useMonthlyTotals';
import { useAddTransaction, useUpdateTransaction, useDeleteTransaction } from '../../src/hooks/useTransactions';
import { usePreferencesStore, defaultProfile } from '../../src/stores/usePreferencesStore';

interface StoredTransaction { id: string; amount: number; occurred_at: string; type: string }
let mockTransactions: StoredTransaction[] = [];
let mockNextId = 0;

jest.mock('../../src/lib/supabase', () => ({
  supabase: {
    rpc: async (_name: string, { p_transaction: tx,p_id,p_start }: { p_start?:string;p_id?:string;p_transaction: { operation: string; id: string; amount: string; occurred_at: string; type: string } }) => {
      if (_name === 'monthly_expense_totals') return { data: [{ month: p_start, total: mockTransactions.filter(row => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0) }], error: null };
      if(_name==='delete_transaction'){mockTransactions=mockTransactions.filter(row=>row.id!==p_id);return {data:null,error:null};}
      const row = { ...tx, amount: Number(tx.amount) };
      if (tx.operation === 'create') mockTransactions.push(row);
      else mockTransactions = mockTransactions.map(existing => existing.id === tx.id ? row : existing);
      return { data: row, error: null };
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) },
    from: () => {
      let operation = 'select';
      let update: Partial<StoredTransaction> = {};
      const filters: [string, string, unknown][] = [];
      const query = {
        select: () => query,
        or: () => query,
        eq: (field: string, value: unknown) => { filters.push(['eq', field, value]); return query; },
        gte: (field: string, value: unknown) => { filters.push(['gte', field, value]); return query; },
        update: (value: Partial<StoredTransaction>) => { operation = 'update'; update = value; return query; },
        delete: () => { operation = 'delete'; return query; },
        insert: async (value: Omit<StoredTransaction, 'id'>) => {
          mockTransactions.push({ ...value, id: `added-${++mockNextId}` });
          return { error: null };
        },
        then: (resolve: (value: { data: StoredTransaction[] | null; error: null }) => unknown) => {
          const matches = (row: StoredTransaction) => filters.every(([comparison, field, value]) => {
            const actual = row[field as keyof StoredTransaction];
            return comparison === 'eq' ? actual === value : String(actual) >= String(value);
          });
          if (operation === 'update') mockTransactions = mockTransactions.map(row => matches(row) ? { ...row, ...update } : row);
          if (operation === 'delete') mockTransactions = mockTransactions.filter(row => !matches(row));
          return Promise.resolve(resolve({ data: operation === 'select' ? mockTransactions.filter(matches) : null, error: null }));
        },
      };
      return query;
    },
  },
}));

it('refreshes an already-loaded spending report after add, update, and delete', async () => {
  usePreferencesStore.setState({ profile: defaultProfile('user-1') });
  const now = new Date().toISOString();
  const month = formatISO(startOfMonth(new Date()), { representation: 'date' });
  mockTransactions = [{ id: 'original', amount: 10, occurred_at: now, type: 'expense' }];
  mockNextId = 0;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  const { result, unmount } = renderHook(() => ({
    report: useMonthlyTotals(1),
    add: useAddTransaction(month),
    update: useUpdateTransaction(month),
    remove: useDeleteTransaction(month),
  }), { wrapper: Wrapper });
  const total = () => result.current.report.data?.[0]?.total;
  await waitFor(() => expect(total()).toBe(10));

  await act(async () => result.current.add.mutateAsync({ categoryId: 'groceries', type: 'expense', amount: 5, note: null, occurredAt: now }));
  await waitFor(() => expect(total()).toBe(15));

  await act(async () => result.current.update.mutateAsync({ id: 'original', categoryId: 'groceries', type: 'expense', amount: 25, note: null, occurredAt: now }));
  await waitFor(() => expect(total()).toBe(30));

  await act(async () => result.current.remove.mutateAsync('original'));
  await waitFor(() => expect(total()).toBe(5));
  unmount();
  client.clear();
  usePreferencesStore.setState({ profile: null });
});
