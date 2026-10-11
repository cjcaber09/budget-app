jest.mock('../../src/components/IncomeSources',()=>({IncomeSourcePicker:()=>null,IncomeSourcesSettings:()=>null}));
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import EditTransactionScreen from '../../app/(tabs)/transaction/[id]';
let mockFeeTransfers:any[]=[];let mockTransferDialogProps:any;
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:[],transfers:mockFeeTransfers,isPending:false,isError:false,isFetching:false,refetch:jest.fn()})}));
const id = '00000000-0000-4000-8000-000000000010';
let mockVisit = 'visit-1';
const mockParent = { id, type: 'expense', category_id: 'cat', amount: 10, note: 'Saved note', occurred_at: '2026-10-07T00:00:00Z' };
let mockParentQuery: Record<string, unknown>;
let mockItemsQuery: Record<string, unknown>;
const mockSave = jest.fn(),mockDelete=jest.fn(),mockBillCommand=jest.fn(),mockBack=jest.fn();
const refetch = jest.fn();
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id, visit: mockVisit, amount: '999', note: 'Untrusted route note' }), useRouter: () => ({ back: mockBack,replace:jest.fn() }) }));
jest.mock('../../src/hooks/useTransactions', () => ({
  useTransaction: () => mockParentQuery, useTransactionItems: () => mockItemsQuery,
  useUpdateTransaction: () => ({ mutate: mockSave, isPending: false }), useDeleteTransaction: () => ({ mutate: mockDelete, isPending: false }),
}));
jest.mock('../../src/hooks/useCategories', () => ({ useCategories: () => ({ isSuccess: true, isFetching: false, data: [{ id: 'cat', name: 'Groceries' }] }) }));
jest.mock('../../src/stores/useUiStore', () => ({ useUiStore: (selector: (state: unknown) => unknown) => selector({ selectedMonth: '2026-10-01' }) }));
beforeEach(() => {
  mockFeeTransfers=[];mockTransferDialogProps=null;
  mockVisit = 'visit-1'; mockSave.mockClear();mockDelete.mockClear();mockBillCommand.mockClear();mockBack.mockClear();
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
it.each([false,true])('requires explicit deletion confirmation and retains the draft on cancel (linked=%s)',linked=>{
 mockParentQuery={data:{...mockParent,...(linked?{occurrence_id:'bill-id'}:{})},isSuccess:true,isFetching:false,refetch};
 render(<EditTransactionScreen/>);
 fireEvent.changeText(screen.getByLabelText('Note'),'Unsaved note');
 fireEvent.press(screen.getByText(linked?'Delete and skip this bill':'Delete Transaction'));
 expect(mockDelete).not.toHaveBeenCalled();
 expect(screen.getByText(/This removes the transaction and any attached receipts/)).toBeTruthy();
 if(linked)expect(screen.getByText(/The linked bill occurrence will be skipped/)).toBeTruthy();
 fireEvent.press(screen.getByText('Keep transaction'));
 expect(mockDelete).not.toHaveBeenCalled();expect(screen.getByLabelText('Note').props.value).toBe('Unsaved note');
 fireEvent.press(screen.getByText(linked?'Delete and skip this bill':'Delete Transaction'));
 fireEvent.press(screen.getByLabelText('Confirm transaction deletion'));
 expect(mockDelete).toHaveBeenCalledTimes(1);expect(mockDelete).toHaveBeenCalledWith(id,expect.any(Object));
 act(()=>mockDelete.mock.calls[0][1].onSuccess());
 expect(screen.queryByLabelText('Confirm transaction deletion')).toBeNull();expect(mockBack).toHaveBeenCalledTimes(1);
});
it('requires confirmation before removing an expense for replacement',()=>{
 mockParentQuery={data:{...mockParent,occurrence_id:'bill-id'},isSuccess:true,isFetching:false,refetch};render(<EditTransactionScreen/>);
 fireEvent.press(screen.getByText('Replace this expense'));expect(mockBillCommand).not.toHaveBeenCalled();
 expect(screen.getByText(/The bill stays pending/)).toBeTruthy();fireEvent.press(screen.getByText('Keep transaction'));expect(mockBillCommand).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Replace this expense'));fireEvent.press(screen.getByLabelText('Confirm expense replacement'));
 expect(mockBillCommand).toHaveBeenCalledWith({id:'bill-id',command:'replace',transactionId:id},expect.any(Object));expect(mockDelete).not.toHaveBeenCalled();
 act(()=>mockBillCommand.mock.calls[0][1].onSuccess({occurrence:{id:'bill-id'}}));
 expect(screen.queryByLabelText('Confirm expense replacement')).toBeNull();
});
jest.mock('../../src/hooks/useDashboard',()=>({useBillCommand:()=>({mutate:mockBillCommand,isPending:false})}));

jest.mock('../../src/components/TransactionAttachments',()=>({useProofDraft:()=>({busy:false,savedId:null,upload:async()=>true}),ProofPicker:()=>null,AttachmentRetry:()=>null,SavedAttachments:()=>null}));
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodPicker:()=>null,TransferDialog:(props:any)=>{mockTransferDialogProps=props;return null;}}));
it('linked fees have no ordinary edit or delete and open their parent transfer',()=>{
 mockParentQuery={data:{...mockParent,transfer_id:'transfer-id'},isSuccess:true,isFetching:false,refetch};
 mockFeeTransfers=[{id:'transfer-id',source_id:'source',destination_id:'destination',amount:'985.00',fee_amount:'10.00',fee_mode:'deducted',transfer_date:'2026-10-07',note:null}];
 render(<EditTransactionScreen/>);expect(screen.getByText('Transfer fee')).toBeTruthy();expect(screen.queryByLabelText('Amount')).toBeNull();expect(screen.queryByText('Delete Transaction')).toBeNull();
 fireEvent.press(screen.getByText('Edit transfer'));expect(mockTransferDialogProps.initial.id).toBe('transfer-id');
 act(()=>mockTransferDialogProps.onClose());expect(mockBack).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Edit transfer'));act(()=>{mockTransferDialogProps.onClose();mockTransferDialogProps.onSaved();});expect(mockBack).toHaveBeenCalledTimes(1);
});
jest.mock('../../src/components/ExpenseBalanceReview',()=>({
 useExpenseBalanceReview:()=>({review:(_input:unknown,proceed:()=>void)=>proceed(),checking:false,pending:null,Controls:()=>null}),
 ExpenseReviewMethodDialog:()=>null,
}));
