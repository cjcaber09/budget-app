import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useAddTransaction, useUpdateTransaction } from '../../src/hooks/useTransactions';
const mockRpc = jest.fn();
jest.mock('../../src/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));
const id = '00000000-0000-4000-8000-000000000010';
const month = '2026-10-01';
const existing = { id, user_id: 'u', category_id: 'cat', type: 'expense' as const, amount: 10, note: null, occurred_at: '2026-10-07T00:00:00Z', recurring_rule_id: null };
const item = { kind: 'item' as const, label: 'Bread', amountCents: 1005, quantity: '2', unitPriceCents: 500, taxIncluded: false };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
  client.setQueryData(['transactions', month], [existing]);
  client.setQueryData(['transactionItems', id], []);
  client.setQueryData(['monthlyTotals', 12], [{ total: 10 }]);
  function Wrapper({ children }: PropsWithChildren) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
  const hook = renderHook(() => ({ add: useAddTransaction(month), update: useUpdateTransaction(month) }), { wrapper: Wrapper });
  return { client, ...hook };
}
beforeEach(() => mockRpc.mockReset());
it('sends canonical decimals and handles the RPC row-array response with authoritative cache refresh', async () => {
  const { result, client, unmount } = setup();
  mockRpc.mockResolvedValue({ data: [{ ...existing, amount: 10.05 }], error: null });
  await act(async () => result.current.update.mutateAsync({ id, categoryId: 'cat', type: 'expense', amount: 999, note: null, occurredAt: existing.occurred_at, items: [item] }));
  expect(mockRpc).toHaveBeenCalledWith('save_transaction', expect.objectContaining({
    p_transaction: expect.objectContaining({ operation: 'update', amount: '10.05' }),
    p_items: [{ kind: 'item', label: 'Bread', amount: '10.05', quantity: '2', unit_price: '5.00', tax_included: false, affects_total:true,is_payment_summary:false,fee_party:null }],
  }));
  expect(client.getQueryData(['transaction', id])).toMatchObject({ amount: 10.05 });
  expect(client.getQueryState(['transactionItems', id])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['monthlyTotals', 12])?.isInvalidated).toBe(true);
  unmount(); client.clear();
});
it('rolls back optimistic amounts after an atomic save failure without replacing item cache', async () => {
  const { result, client, unmount } = setup();
  let rejectSave!: (error: unknown) => void;
  mockRpc.mockImplementation(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
  let saving!: Promise<unknown>;
  act(() => { saving = result.current.update.mutateAsync({ id, categoryId: 'cat', type: 'expense', amount: 99, note: null, occurredAt: existing.occurred_at, items: [item] }).catch(error => error); });
  await waitFor(() => expect(mockRpc).toHaveBeenCalled());
  expect(client.getQueryData(['transactions', month])).toEqual([expect.objectContaining({ amount: 10.05 })]);
  await act(async () => { rejectSave(new Error('Connection lost')); await saving; });
  expect(client.getQueryData(['transactions', month])).toEqual([existing]);
  expect(client.getQueryData(['transactionItems', id])).toEqual([]);
  unmount(); client.clear();
});
it('preserves income item rows and reuses a caller-supplied stable create UUID', async () => {
  const { result, client, unmount } = setup();
  mockRpc.mockResolvedValue({ data: [{ ...existing, type: 'income', category_id: null, amount: 20 }], error: null });
  const input = { id, categoryId: null, type: 'income' as const, amount: 20, note: null, occurredAt: existing.occurred_at, items: [item] };
  await act(async () => { await result.current.add.mutateAsync(input); await result.current.add.mutateAsync(input); });
  expect(mockRpc.mock.calls.map(call => call[1].p_transaction.id)).toEqual([id, id]);
  expect(mockRpc.mock.calls[0][1].p_items).toEqual([expect.objectContaining({amount:'10.05',affects_total:true})]);
  unmount(); client.clear();
});
it('moves a dated transaction between cached months and restores both after failure',async()=>{
  const {result,client,unmount}=setup();
  const september='2026-09-01'; client.setQueryData(['transactions',september],[]);
  let fail!:(reason:unknown)=>void;
  mockRpc.mockImplementation(()=>new Promise((_resolve,reject)=>{fail=reject;}));
  let saving!:Promise<unknown>;
  act(()=>{saving=result.current.update.mutateAsync({id,categoryId:'cat',type:'expense',amount:10,note:null,occurredAt:'2026-09-01T04:00:00Z',transactionDate:september}).catch(error=>error);});
  await waitFor(()=>expect(mockRpc).toHaveBeenCalled());
  expect(client.getQueryData(['transactions',month])).toEqual([]);
  expect(client.getQueryData(['transactions',september])).toEqual([expect.objectContaining({transaction_date:september})]);
  await act(async()=>{fail(new Error('Lost connection'));await saving;});
  expect(client.getQueryData(['transactions',month])).toEqual([existing]);
  expect(client.getQueryData(['transactions',september])).toEqual([]);
  unmount();client.clear();
});
