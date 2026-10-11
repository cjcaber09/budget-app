import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {RefundsPanel} from '../../src/components/RefundsPanel';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
const owner='00000000-0000-4000-8000-000000000001';
const expense='00000000-0000-4000-8000-000000000002';
const method='00000000-0000-4000-8000-000000000003';
const mockSave=jest.fn(),mockRefetch=jest.fn();let mockQuery:any,mockRefundId:string|undefined;
jest.mock('../../src/hooks/useRefunds',()=>({useRefunds:()=>mockQuery,useSaveRefund:()=>({mutateAsync:mockSave,isPending:false})}));
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({refundSupported:true,methods:[{id:method,user_id:owner,name:'Cash',method:'cash',payment_type:'Cash',archived:false}],isPending:false,isError:false,isFetching:false})}));
jest.mock('../../src/lib/supabase',()=>({supabase:{}}));
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({refundId:mockRefundId})}));
const transaction:any={id:expense,user_id:owner,type:'expense',amount:100,category_id:null,transaction_date:'2026-01-01',occurred_at:'2026-01-01T00:00:00Z',occurrence_id:'paid-bill'};
beforeEach(()=>{jest.clearAllMocks();mockRefundId=undefined;usePreferencesStore.getState().setProfile(defaultProfile(owner));mockQuery={data:{owner,expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',amount:10000,refunded:0,rows:[]},isError:false,isFetching:false,refetch:mockRefetch};mockSave.mockResolvedValue({owner});});
test('paid bills allow partial refunds, format the input and close after a confirmed save',async()=>{
 render(<RefundsPanel transaction={transaction}/>);expect(screen.getByText(/This bill stays marked paid/)).toBeTruthy();fireEvent.press(screen.getByLabelText('Record refund'));
 fireEvent.changeText(screen.getByLabelText('Refund amount'),'25.50');fireEvent.press(screen.getAllByText('Record refund').at(-1)!);
 await waitFor(()=>expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({expenseId:expense,expenseCreatedAt:'2026-01-01T00:00:00Z',operation:'create',amount:'25.50',methodId:method})));
 await waitFor(()=>expect(screen.queryByLabelText('Refund amount')).toBeNull());
});
test('over-refunds are rejected and a lost response preserves the same create UUID and draft',async()=>{
 mockSave.mockRejectedValueOnce(new Error('Could not confirm the refund.'));render(<RefundsPanel transaction={transaction}/>);fireEvent.press(screen.getByLabelText('Record refund'));
 fireEvent.changeText(screen.getByLabelText('Refund amount'),'100.01');fireEvent.press(screen.getAllByText('Record refund').at(-1)!);expect(mockSave).not.toHaveBeenCalled();
 fireEvent.changeText(screen.getByLabelText('Refund amount'),'50');fireEvent.press(screen.getAllByText('Record refund').at(-1)!);await screen.findByText('Could not confirm the refund.');const first=mockSave.mock.calls[0][0];
 expect(screen.getByLabelText('Refund amount').props.value).toBe('50');fireEvent.press(screen.getAllByText('Record refund').at(-1)!);await waitFor(()=>expect(mockSave).toHaveBeenCalledTimes(2));expect(mockSave.mock.calls[1][0]).toEqual(first);
});
test('refund edit opens from history and removal requires confirmation; cancel makes no write',async()=>{
 const refund={id:'00000000-0000-4000-8000-000000000004',user_id:owner,expense_id:expense,method_id:method,amount:'25.00',refund_date:'2026-01-02',note:null,version:1};mockRefundId=refund.id;mockQuery.data={...mockQuery.data,refunded:2500,rows:[refund]};render(<RefundsPanel transaction={transaction}/>);
 await screen.findByLabelText('Refund amount');fireEvent.press(screen.getByText('Remove refund'));expect(mockSave).not.toHaveBeenCalled();fireEvent.press(screen.getByText('Keep refund'));expect(mockSave).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Remove refund'));fireEvent.press(screen.getByLabelText('Confirm removing refund'));await waitFor(()=>expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({id:refund.id,operation:'delete',expectedVersion:1})));await waitFor(()=>expect(screen.queryByLabelText('Refund amount')).toBeNull());
});
