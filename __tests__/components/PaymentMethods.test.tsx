import {TransferEntryForm as TransferForm} from '../../src/components/TransferEntryForm';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
jest.mock('../../src/hooks/useReports',()=>({useReportTransactions:()=>({data:[],isPending:false,isError:false}),useReportTransfers:()=>({data:[],isPending:false,isError:false})}));
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>({data:[],isPending:false,isError:false})}));
import {PaymentMethodForm} from '../../src/components/PaymentMethodForm';
import {PaymentMethodPicker,PaymentMethodsSettings} from '../../src/components/PaymentMethodPicker';
import {TransactionForm} from '../../src/components/TransactionForm';
import {BalanceCorrectionForm} from '../../src/components/PaymentActivityForms';
import {CARD_PRIVACY_NOTE,type PaymentMethod} from '../../src/domain/paymentMethods';
const mockSaveAsync=jest.fn();
const mockSave=jest.fn();const mockRefetch=jest.fn();const mockCorrect=jest.fn();
const mockTransfer=jest.fn();
const mockLoadDraft=jest.fn();
const mockSaveDraft=jest.fn();
jest.mock('../../src/lib/transactionDraftStorage',()=>({loadTransactionDraft:()=>mockLoadDraft(),saveTransactionDraft:(...args:unknown[])=>mockSaveDraft(...args),clearTransactionDraft:async()=>{},transactionDraftGeneration:()=>0}));
jest.mock('../../src/hooks/useTransferEntry',()=>({useTransferCommand:()=>({mutateAsync:mockTransfer,isPending:false}),useTransferEntry:()=>({isPending:false,isSuccess:false})}));
jest.mock('../../src/components/TransactionAttachments',()=>({useProofDraft:()=>({busy:false,savedId:null,upload:async()=>true}),ProofPicker:()=>null,AttachmentRetry:()=>null,SavedAttachments:()=>null}));
let mockQuery:any;let mockPending=false;let mockOwner='owner';
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>mockQuery,useSavePaymentMethod:()=>({mutate:mockSave,mutateAsync:mockSaveAsync,isPending:mockPending,reset:jest.fn()}),useSavePaymentTransfer:()=>({mutate:mockTransfer,isPending:false}),useCorrectMethodBalance:()=>({mutate:mockCorrect,isPending:false})}));
jest.mock('../../src/stores/usePreferencesStore',()=>({activeTimezone:()=> 'Asia/Manila',usePreferencesStore:Object.assign((selector:any)=>selector({profile:{user_id:mockOwner,timezone:'Asia/Manila'}}),{getState:()=>({profile:{user_id:mockOwner,timezone:'Asia/Manila'}})})}));
const card:PaymentMethod={id:'card-1',user_id:'owner',method:'card',payment_type:'Debit card',name:'Metrobank',last_four:'8035',opening_balance:'40300.50',baseline_at:'2026-10-08T00:00:00Z',archived:false,balance:'40200.50',has_activity:true,related_bills:[]};
beforeEach(()=>{mockOwner='owner';mockQuery={transferEntrySupported:true,methods:[card],isPending:false,isError:false,refetch:mockRefetch};mockPending=false;jest.clearAllMocks();mockRefetch.mockResolvedValue({isError:false,data:{owner:"owner"}});mockSaveAsync.mockResolvedValue({...card,id:"new-method",name:"New bank"});mockLoadDraft.mockResolvedValue(null);mockSaveDraft.mockResolvedValue(undefined);mockTransfer.mockRejectedValue(new Error('Synthetic retry'));});
function fill(balance='40300.50'){fireEvent.changeText(screen.getByLabelText('Payment method name'),'Metrobank');fireEvent.changeText(screen.getByLabelText('Initial balance'),balance);}

test('bank types use pills and preserve an existing generic bank type until changed',()=>{
 const save=jest.fn();const view=render(<PaymentMethodForm submitting={false} onSave={save} onCancel={jest.fn()}/>);
 expect(screen.queryByLabelText('Payment type')).toBeNull();fireEvent.press(screen.getByText('Bank account'));fill('1000');
 fireEvent.press(screen.getByText('Create payment method'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({method:'bank_account',paymentType:'Savings account'}));
 fireEvent.press(screen.getByLabelText('Account type Checking'));fireEvent.press(screen.getByText('Create payment method'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({paymentType:'Checking account'}));
 view.unmount();render(<PaymentMethodForm initial={{...card,method:'bank_account',payment_type:'Bank account',last_four:null,has_activity:false}} submitting={false} onSave={save} onCancel={jest.fn()}/>);
 fireEvent.press(screen.getByText('Save payment method'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({paymentType:'Bank account'}));
 fireEvent.press(screen.getByLabelText('Account type Savings'));fireEvent.press(screen.getByText('Save payment method'));expect(save).toHaveBeenLastCalledWith(expect.objectContaining({paymentType:'Savings account'}));
});
test('deducted fees preview source debit and save only received principal; unchanged edit preserves it',async()=>{
 const destination={...card,id:'destination',name:'Wallet'};
 render(<TransferForm methods={[card,destination]} initial={{id:'transfer',source_id:card.id,destination_id:destination.id,amount:'985.00',fee_amount:'15.00',fee_mode:'deducted',transfer_date:'2026-10-12',note:null}} onClose={jest.fn()}/>);
 expect(screen.getByLabelText('Transfer amount').props.value).toBe('1,000.00');
 expect(screen.getByText('Total deducted: $1,000.00')).toBeTruthy();expect(screen.getByText('Amount received: $985.00')).toBeTruthy();
 fireEvent.press(screen.getByText('Save transfer changes'));await waitFor(()=>expect(mockTransfer).toHaveBeenCalledWith(expect.objectContaining({amount:'985.00',feeAmount:'15.00',feeMode:'deducted'})));
 expect(screen.getByLabelText('Transfer fee').props.editable).toBe(false);expect(screen.getByText('Retry same save')).toBeTruthy();expect(mockTransfer).toHaveBeenCalledTimes(1);
});
test('added fees show total cost, and deletion explains removal of the linked expense',()=>{
 const destination={...card,id:'destination',name:'Wallet'};
 render(<TransferForm methods={[card,destination]} initial={{id:'transfer',source_id:card.id,destination_id:destination.id,amount:'1000.00',fee_amount:'15.00',fee_mode:'added',transfer_date:'2026-10-12',note:null}} onClose={jest.fn()}/>);
 expect(screen.getByText('Total deducted: $1,015.00')).toBeTruthy();expect(screen.getByText('Amount received: $1,000.00')).toBeTruthy();
 fireEvent.press(screen.getByText('Delete transfer'));expect(screen.getByText('Delete this transfer and its fee expense? Both tracked balances will be recalculated.')).toBeTruthy();
});
test('transfer save is disabled until the owner snapshot advertises server support',()=>{
 mockQuery.transferEntrySupported=false;
 render(<TransferForm methods={[card]} onClose={jest.fn()}/>);
 expect(screen.getByText('Refresh after the server update to enable transfers.')).toBeTruthy();
});
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

test('starts transfers from method details with that method selected and saves ungrouped money',async()=>{
 const cash={...card,id:'cash-1',method:'cash',payment_type:'Cash',name:'Cash',last_four:null,opening_balance:'0.00',balance:'0.00'};
 mockQuery={...mockQuery,methods:[cash,card],transfers:[],corrections:[]};
 render(<PaymentMethodsSettings/>);
 expect(screen.queryByLabelText('Transfer between payment methods')).toBeNull();
 fireEvent.press(screen.getByLabelText('Edit payment method Metrobank'));
 fireEvent.press(screen.getByLabelText('Transfer between payment methods'));
 expect(screen.getByLabelText('Transfer amount')).toBeTruthy();
 fireEvent(screen.getByLabelText('To account'),'focus');fireEvent.press(screen.getByText('Cash · Cash'));
 fireEvent.changeText(screen.getByLabelText('Transfer amount'),'1,000.50');
 fireEvent.press(screen.getByText('Record transfer'));
 await waitFor(()=>expect(mockTransfer).toHaveBeenCalledWith(expect.objectContaining({sourceId:card.id,destinationId:cash.id,amount:'1000.50'})));
 expect(mockSaveDraft).toHaveBeenCalledWith(expect.objectContaining({version:2,pending:expect.objectContaining({sourceId:card.id,destinationId:cash.id,amount:'1000.50'})}),0);
});
test('Settings transfer keeps another unfinished draft and sends no financial request',async()=>{
 mockLoadDraft.mockResolvedValue({id:'another-draft'});
 const destination={...card,id:'destination',name:'Wallet'};
 render(<TransferForm methods={[card,destination]} initialFields={{sourceId:card.id,destinationId:destination.id,amount:'100'}} onClose={jest.fn()}/>);
 fireEvent.press(screen.getByText('Record transfer'));
 await screen.findByText('Another unfinished entry is saved. Resume or discard it in Add Transaction first.');
 expect(mockTransfer).not.toHaveBeenCalled();expect(mockSaveDraft).not.toHaveBeenCalled();
});

for(const label of ['From account','To account'])test('late blur cannot hide creation for '+label+'; cancel restores both fields',()=>{
 render(<TransferForm methods={[card]} onClose={jest.fn()}/>);
 fireEvent.changeText(screen.getByLabelText('Transfer amount'),'1200');fireEvent.changeText(screen.getByLabelText('Transfer note'),'Keep draft');
 const input=screen.getByLabelText(label);fireEvent(input,'focus');fireEvent.press(screen.getByText('Add payment method'));fireEvent(input,'blur');
 expect(screen.getByLabelText('Payment method name')).toBeTruthy();fireEvent.press(screen.getByLabelText('Close Add payment method'));
 expect(screen.getByLabelText('From account').props.editable).toBe(true);expect(screen.getByLabelText('To account').props.editable).toBe(true);
 expect(screen.getByLabelText('Transfer amount').props.value).toBe('1,200');expect(screen.getByLabelText('Transfer note').props.value).toBe('Keep draft');
 fireEvent(screen.getByLabelText(label),'focus');expect(screen.getByText('Add payment method')).toBeTruthy();
});
test('lost method response retries the exact UUID/payload and retains its label until refresh',async()=>{
 mockSaveAsync.mockRejectedValueOnce(new Error('timeout'));mockRefetch.mockResolvedValueOnce({isError:true});
 render(<TransferForm methods={[card]} onClose={jest.fn()}/>);fireEvent(screen.getByLabelText('To account'),'focus');fireEvent.press(screen.getByText('Add payment method'));fill('1000');fireEvent.press(screen.getByText('Create payment method'));
 await waitFor(()=>expect(screen.getByText('Retry same payment method')).toBeTruthy());const first=mockSaveAsync.mock.calls[0][0];fireEvent.press(screen.getByText('Retry same payment method'));
 await waitFor(()=>expect(screen.getByText('Retry refreshing accounts')).toBeTruthy());expect(mockSaveAsync.mock.calls[1][0]).toEqual(first);
 fireEvent.press(screen.getByText('Retry refreshing accounts'));await waitFor(()=>expect(screen.getByLabelText('To account').props.value).toBe('New bank'));expect(mockSaveAsync).toHaveBeenCalledTimes(2);expect(screen.getByLabelText('From account').props.value).toBe('');
});
test('Settings transfer reuses its one native modal while creating an account',()=>{
 const {Modal}=require('react-native');const view=render(<PaymentMethodsSettings/>);fireEvent.press(screen.getByLabelText('Edit payment method Metrobank'));fireEvent.press(screen.getByLabelText('Transfer between payment methods'));
 fireEvent(screen.getByLabelText('To account'),'focus');fireEvent.press(screen.getByText('Add payment method'));expect(screen.getByLabelText('Payment method name')).toBeTruthy();expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
 fireEvent.press(screen.getByText('Cancel'));expect(screen.getByLabelText('To account').props.editable).toBe(true);
});

test('method creation ignores a late response after leaving the active visit',async()=>{
 let resolve!:(method:PaymentMethod)=>void;mockSaveAsync.mockImplementationOnce(()=>new Promise<PaymentMethod>(done=>{resolve=done;}));
 const view=render(<TransferForm active methods={[card]} onClose={jest.fn()}/>);fireEvent(screen.getByLabelText('From account'),'focus');fireEvent.press(screen.getByText('Add payment method'));fill('1000');fireEvent.press(screen.getByText('Create payment method'));
 view.rerender(<TransferForm active={false} methods={[card]} onClose={jest.fn()}/>);
 await act(async()=>resolve({...card,id:'late',name:'Late account'}));expect(mockRefetch).not.toHaveBeenCalled();expect(screen.getByLabelText('From account').props.value).toBe('');expect(screen.queryByLabelText('Payment method name')).toBeNull();
});
test('method creation cannot select a late result for a different owner',async()=>{
 let resolve!:(method:PaymentMethod)=>void;mockSaveAsync.mockImplementationOnce(()=>new Promise<PaymentMethod>(done=>{resolve=done;}));
 render(<TransferForm methods={[card]} onClose={jest.fn()}/>);fireEvent(screen.getByLabelText('To account'),'focus');fireEvent.press(screen.getByText('Add payment method'));fill('1000');fireEvent.press(screen.getByText('Create payment method'));mockOwner='other';
 await act(async()=>resolve({...card,id:'late',name:'Late account'}));expect(mockRefetch).not.toHaveBeenCalled();expect(screen.getByLabelText('To account').props.value).toBe('');
});

test('a definite method rejection restores the same editable draft',async()=>{
 mockSaveAsync.mockRejectedValueOnce(Object.assign(new Error('Choose another name'),{rejected:true}));
 render(<TransferForm methods={[card]} onClose={jest.fn()}/>);fireEvent(screen.getByLabelText('From account'),'focus');fireEvent.press(screen.getByText('Add payment method'));fill('1000');fireEvent.press(screen.getByText('Create payment method'));
 await waitFor(()=>expect(screen.getByText('Choose another name')).toBeTruthy());expect(screen.getByLabelText('Payment method name').props.value).toBe('Metrobank');expect(screen.getByLabelText('Initial balance').props.value).toBe('1,000');
 const first=mockSaveAsync.mock.calls[0][0];fireEvent.changeText(screen.getByLabelText('Payment method name'),'Accepted name');fireEvent.press(screen.getByText('Create payment method'));await waitFor(()=>expect(mockSaveAsync).toHaveBeenCalledTimes(2));expect(mockSaveAsync.mock.calls[1][0]).toEqual({...first,name:'Accepted name'});
});
