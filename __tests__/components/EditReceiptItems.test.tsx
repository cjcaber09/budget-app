jest.mock('../../src/components/IncomeSources',()=>({IncomeSourcePicker:()=>null,IncomeSourcesSettings:()=>null}));
import { fireEvent, render, screen } from '@testing-library/react-native';
import EditTransactionScreen from '../../app/(tabs)/transaction/[id]';
const id = '00000000-0000-4000-8000-000000000010';
let mockVisit = 'visit-1';
const mockParent = { id, type: 'expense', category_id: 'cat', amount: 10, note: 'Saved note', occurred_at: '2026-10-07T00:00:00Z' };
let mockParentQuery: Record<string, unknown>;
let mockItemsQuery: Record<string, unknown>;
const mockSave = jest.fn();
const refetch = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id, visit: mockVisit, amount: '999', note: 'Untrusted route note' }), useRouter: () => ({ back: jest.fn() }) }));
jest.mock('../../src/hooks/useTransactions', () => ({
  useTransaction: () => mockParentQuery, useTransactionItems: () => mockItemsQuery,
  useUpdateTransaction: () => ({ mutate: mockSave, isPending: false }), useDeleteTransaction: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../../src/hooks/useCategories', () => ({ useCategories: () => ({ isSuccess: true, isFetching: false, data: [{ id: 'cat', name: 'Groceries' }] }) }));
jest.mock('../../src/stores/useUiStore', () => ({ useUiStore: (selector: (state: unknown) => unknown) => selector({ selectedMonth: '2026-10-01' }) }));
beforeEach(() => {
  mockVisit = 'visit-1'; mockSave.mockClear();
  mockParentQuery = { data: mockParent, isSuccess: true, isFetching: false, refetch };
  mockItemsQuery = { data: [], isSuccess: true, isFetching: false, refetch };
});
it('gates item loading and errors, then uses the saved parent rather than route hints', () => {
  mockItemsQuery = { isPending: true, isFetching: true, refetch };
  const { rerender } = render(<EditTransactionScreen />);
  expect(screen.queryByText('Save Changes')).toBeNull();
  mockItemsQuery = { isError: true, refetch };
  rerender(<EditTransactionScreen />);
  expect(screen.queryByText('Save Changes')).toBeNull();
  expect(screen.getByText('Try again')).toBeTruthy();
  mockItemsQuery = { data: [], isSuccess: true, isFetching: false, refetch };
  rerender(<EditTransactionScreen />);
  expect(screen.getByLabelText('Amount').props.value).toBe('10');
  expect(screen.getByLabelText('Note').props.value).toBe('Saved note');
});
it('preserves edits after background refetch/errors and resets when the same transaction reopens', () => {
  const { rerender } = render(<EditTransactionScreen />);
  fireEvent.changeText(screen.getByLabelText('Note'), 'Unsaved draft');
  mockParentQuery = { data: { ...mockParent, note: 'Background update' }, isError: true, refetch };
  rerender(<EditTransactionScreen />);
  expect(screen.getByLabelText('Note').props.value).toBe('Unsaved draft');
  mockParentQuery = { data: mockParent, isSuccess: true, isFetching: false, refetch };
  mockVisit = 'visit-2';
  rerender(<EditTransactionScreen />);
  expect(screen.getByLabelText('Note').props.value).toBe('Saved note');
});
it('requires confirmation for a linked amount edit and retains the draft on cancel',()=>{
  mockParentQuery={data:{...mockParent,occurrence_id:'bill-id'},isSuccess:true,isFetching:false,refetch};
  render(<EditTransactionScreen/>);
  fireEvent.changeText(screen.getByLabelText('Amount'),'8');
  fireEvent.press(screen.getByText('Save Changes'));
  expect(mockSave).not.toHaveBeenCalled();
  expect(screen.getByText('Confirm full settlement')).toBeTruthy();
  fireEvent.press(screen.getByText('Cancel confirmation'));
  expect(screen.getByLabelText('Amount').props.value).toBe('8');
  fireEvent.press(screen.getByText('Save Changes'));
  fireEvent.press(screen.getByText('Confirm full settlement'));
  expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({amount:8,occurrenceId:'bill-id',confirmDifference:true}),expect.any(Object));
});
jest.mock('../../src/hooks/useDashboard',()=>({useBillCommand:()=>({mutate:jest.fn(),isPending:false})}));

jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodPicker:()=>null}));
