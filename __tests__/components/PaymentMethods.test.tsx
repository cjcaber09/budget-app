import {fireEvent,render,screen} from '@testing-library/react-native';
import {PaymentMethodForm} from '../../src/components/PaymentMethodForm';
import {PaymentMethodPicker} from '../../src/components/PaymentMethodPicker';
import {TransactionForm} from '../../src/components/TransactionForm';
import {BalanceCorrectionForm} from '../../src/components/PaymentActivityForms';
import {CARD_PRIVACY_NOTE,type PaymentMethod} from '../../src/domain/paymentMethods';
const mockSave=jest.fn();const mockRefetch=jest.fn();const mockCorrect=jest.fn();
let mockQuery:any;let mockPending=false;
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>mockQuery,useSavePaymentMethod:()=>({mutate:mockSave,isPending:mockPending,reset:jest.fn()}),useSavePaymentTransfer:()=>({mutate:jest.fn()}),useCorrectMethodBalance:()=>({mutate:mockCorrect,isPending:false})}));
jest.mock('../../src/stores/usePreferencesStore',()=>({activeTimezone:()=> 'Asia/Manila',usePreferencesStore:Object.assign((selector:any)=>selector({profile:{user_id:'owner',timezone:'Asia/Manila'}}),{getState:()=>({profile:{user_id:'owner',timezone:'Asia/Manila'}})})}));
const card:PaymentMethod={id:'card-1',user_id:'owner',method:'card',payment_type:'Debit card',name:'Metrobank',last_four:'8035',opening_balance:'40300.50',baseline_at:'2026-10-08T00:00:00Z',archived:false,balance:'40200.50',has_activity:true,related_bills:[]};
beforeEach(()=>{mockQuery={methods:[card],isPending:false,isError:false,refetch:mockRefetch};mockPending=false;jest.clearAllMocks();});
function fill(balance='40300.50'){fireEvent.changeText(screen.getByLabelText('Payment method name'),'Metrobank');fireEvent.changeText(screen.getByLabelText('Initial balance'),balance);}
test('initial balance is required and optional card digits stay blank',()=>{
 const save=jest.fn();render(<PaymentMethodForm submitting={false} onSave={save} onCancel={jest.fn()}/>);
 expect(screen.getByText(CARD_PRIVACY_NOTE)).toBeTruthy();fireEvent.changeText(screen.getByLabelText('Payment method name'),'Metrobank');fireEvent.press(screen.getByText('Create payment method'));expect(save).not.toHaveBeenCalled();
 fill();fireEvent.press(screen.getByText('Create payment method'));expect(save).toHaveBeenCalledWith(expect.objectContaining({openingBalance:'40300.50',lastFour:''}));
});
test('pasting a full card number is rejected instead of truncated',()=>{
 const save=jest.fn();render(<PaymentMethodForm submitting={false} onSave={save} onCancel={jest.fn()}/>);fill();fireEvent.changeText(screen.getByLabelText('Last four card digits'),'1234567890123456');fireEvent.press(screen.getByText('Create payment method'));expect(save).not.toHaveBeenCalled();expect(screen.getByText('Enter exactly four digits, or leave the last digits blank.')).toBeTruthy();
});
test('credit cards use positive amount owed and reject negative debt',()=>{
 const save=jest.fn();render(<PaymentMethodForm submitting={false} onSave={save} onCancel={jest.fn()}/>);fireEvent.press(screen.getByText('Credit card'));fill('-50');fireEvent.press(screen.getByText('Create payment method'));expect(save).not.toHaveBeenCalled();expect(screen.getByText('Initial amount owed (required)')).toBeTruthy();fill('50');fireEvent.press(screen.getByText('Create payment method'));expect(save).toHaveBeenCalledWith(expect.objectContaining({paymentType:'Credit card',openingBalance:'50'}));
});
test('changing an initial balance after activity requires explicit confirmation',()=>{
 const save=jest.fn();render(<PaymentMethodForm initial={card} submitting={false} onSave={save} onCancel={jest.fn()}/>);fireEvent.changeText(screen.getByLabelText('Initial balance'),'50000');fireEvent.press(screen.getByText('Save payment method'));expect(save).not.toHaveBeenCalled();fireEvent.press(screen.getByText('Confirm initial balance change'));expect(save).toHaveBeenCalledWith(expect.objectContaining({confirmOpening:true,openingBalance:'50000'}));
});
test('canceling inline creation keeps the parent transaction draft and Cash selection',()=>{
 const submit=jest.fn();render(<TransactionForm categories={[]} submitLabel="Save transaction" onSubmit={submit} paymentMethodControl={(value,onChange)=><PaymentMethodPicker value={value} onChange={onChange}/>}/>);
 fireEvent.press(screen.getByText('Income'));fireEvent.changeText(screen.getByPlaceholderText('0.00'),'2000');fireEvent.press(screen.getByLabelText('Choose payment method'));fireEvent.press(screen.getByText('Add payment method'));fill();fireEvent.press(screen.getByText('Cancel'));fireEvent.press(screen.getByLabelText('Close payment method'));fireEvent.press(screen.getByText('Save transaction'));expect(submit).toHaveBeenCalledWith(expect.objectContaining({amount:2000,paymentMethodId:null}));expect(mockSave).not.toHaveBeenCalled();
});
test('successful inline method creation selects it without saving the transaction',()=>{
 const submit=jest.fn();render(<TransactionForm categories={[]} submitLabel="Save transaction" onSubmit={submit} paymentMethodControl={(value,onChange)=><PaymentMethodPicker value={value} onChange={onChange}/>}/>);
 fireEvent.press(screen.getByText('Income'));fireEvent.changeText(screen.getByPlaceholderText('0.00'),'2000');fireEvent.press(screen.getByLabelText('Choose payment method'));fireEvent.press(screen.getByText('Add payment method'));fill();fireEvent.press(screen.getByText('Create payment method'));expect(submit).not.toHaveBeenCalled();const callbacks=mockSave.mock.calls[0][1];require('@testing-library/react-native').act(()=>callbacks.onSuccess(card));fireEvent.press(screen.getByText('Save transaction'));expect(submit).toHaveBeenCalledWith(expect.objectContaining({paymentMethodId:'card-1',amount:2000}));
});
test('method load failure preserves a saved selection and offers retry',()=>{
 mockQuery={isPending:false,isError:true,refetch:mockRefetch};const changed=jest.fn();render(<PaymentMethodPicker value="existing-card" onChange={changed}/>);expect(screen.getByText('Saved payment method')).toBeTruthy();fireEvent.press(screen.getByText('Retry payment methods'));expect(mockRefetch).toHaveBeenCalled();expect(changed).not.toHaveBeenCalled();
});
test('failed balance refresh explains disabled confirmation and retry preserves the correction draft',()=>{
 const props={method:card,onClose:jest.fn(),refresh:mockRefetch,loading:false};const view=render(<BalanceCorrectionForm {...props} unavailable/>);
 fireEvent.changeText(screen.getByLabelText('Target balance'),'39000');fireEvent.changeText(screen.getByLabelText('Correction note'),'Statement');
 expect(screen.getByText('Balances could not refresh. Choose Refresh balances to retry; your correction draft is still here.')).toBeTruthy();
 fireEvent.press(screen.getByText('Confirm balance correction'));expect(mockCorrect).not.toHaveBeenCalled();fireEvent.press(screen.getByText('Refresh balances'));expect(mockRefetch).toHaveBeenCalled();
 view.rerender(<BalanceCorrectionForm {...props} unavailable={false}/>);fireEvent.press(screen.getByText('Confirm balance correction'));expect(mockCorrect).toHaveBeenCalledWith(expect.objectContaining({targetBalance:'39000',note:'Statement',expectedBalance:'40200.50'}),expect.anything());
});
