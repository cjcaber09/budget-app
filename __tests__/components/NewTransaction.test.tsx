jest.mock('../../src/components/TransactionAttachments',()=>({useProofDraft:()=>({busy:false,savedId:null,prepareScan:jest.fn(),upload:async()=>true}),ProofPicker:()=>null,AttachmentRetry:()=>null}));
jest.mock('../../src/components/BillPaymentForm',()=>({BillPaymentForm:()=>null}));
jest.mock('../../src/components/IncomeSources',()=>({IncomeSourcePicker:({onChange}: {onChange:(id:string)=>void})=>{
 const {Pressable,Text}=require('react-native');
 return <Pressable onPress={()=>onChange('00000000-0000-4000-8000-000000000301')}><Text>Choose salary source</Text></Pressable>;
},IncomeSourcesSettings:()=>null}));
import { render, screen, fireEvent, act,waitFor,configure } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
jest.mock('../../src/lib/supabase',()=>({supabase:{}}));
jest.mock('../../src/hooks/useIncomeSources',()=>({useIncomeSources:()=>({data:[],isSuccess:true})}));
const mockTransferSave=jest.fn();
const mockTransferMethods=[{id:'00000000-0000-4000-8000-000000000201',user_id:'00000000-0000-4000-8000-000000000001',name:'Cash',method:'cash',payment_type:'Cash',last_four:null,archived:false},{id:'00000000-0000-4000-8000-000000000202',user_id:'00000000-0000-4000-8000-000000000001',name:'Bank',method:'bank_account',payment_type:'Savings',last_four:null,archived:false}];
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:mockTransferMethods,isSuccess:true,transferEntrySupported:true}),useSavePaymentMethod:()=>({mutate:jest.fn(),isPending:false})}));
jest.mock('../../src/hooks/useTransferEntry',()=>({useTransferCommand:()=>({mutateAsync:mockTransferSave,isPending:false}),transferStatus:jest.fn()}));
import { reconcileReceipt } from '../../supabase/functions/ocr/shared';
import NewTransactionScreen from '../../app/(tabs)/transaction/new';
import { useScanStore } from '../../src/stores/useScanStore';
import { useToastStore } from '../../src/stores/useToastStore';

const mockRunOcr = jest.fn();
const mockAddTransaction = jest.fn();
jest.mock('../../src/components/ExpenseBalanceReview',()=>({
 useExpenseBalanceReview:()=>({review:(_input:unknown,proceed:()=>void)=>proceed(),checking:false,pending:null,Controls:()=>null}),
 ExpenseReviewMethodDialog:()=>null,
}));

jest.mock('../../src/hooks/useOcr', () => ({
  useOcrScan: () => ({ mutate: mockRunOcr }),
}));

jest.mock('../../src/hooks/useCategories', () => ({
  useCategories: () => ({isSuccess:true,isFetching:false,
    data: [{ id: '00000000-0000-4000-8000-000000000010', user_id: '00000000-0000-4000-8000-000000000001', name: 'Groceries', color: '#4CAF50', icon: 'cart', is_default: true }],
  }),
}));

jest.mock('../../src/hooks/useTransactions', () => ({
  useAddTransaction: () => ({ mutate: mockAddTransaction }),
  useTransaction:()=>({isSuccess:true,isFetching:false,data:{id:'00000000-0000-4000-8000-000000000100',user_id:'00000000-0000-4000-8000-000000000001',type:'expense',amount:29,note:'Repeat coffee',category_id:'00000000-0000-4000-8000-000000000010',transaction_date:'2026-01-01',occurred_at:'2026-01-01T00:00:00Z',payment_details:{reference:'Old reference'}}}),
  useTransactionItems:()=>({isSuccess:true,isFetching:false,data:[]}),
}));

jest.mock('../../src/stores/useUiStore', () => ({
  useUiStore: (selector: (state: { selectedMonth: string }) => unknown) =>
    selector({ selectedMonth: '2026-10-01' }),
}));

let mockParams: { visit?: string;repeatId?:string } = {};

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const IMAGE = {
  uri: 'file:///scan.jpg',
  base64: 'QUJD',
  mimeType: 'image/jpeg' as const,
  requestId: '3f8a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b',
};

configure({asyncUtilTimeout:5000});
jest.setTimeout(20000);
describe('NewTransactionScreen', () => {
  beforeEach(async() => {
    await AsyncStorage.clear();
    usePreferencesStore.getState().setProfile(defaultProfile('00000000-0000-4000-8000-000000000001'));
    mockRunOcr.mockReset();
    mockAddTransaction.mockReset();
    mockParams = { visit: IMAGE.requestId };
    useScanStore.getState().clearPendingImage();
    useToastStore.getState().dismissToast();
  });

  it('scans the pending image exactly once and prefills the note', async () => {
    mockRunOcr.mockImplementation((_variables, options) =>
      options.onSuccess({ scanId: 's1', text: 'TOTAL 12.50', path: 'u1/s1.txt', truncated: false })
    );
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});

    expect(await screen.findByDisplayValue('TOTAL 12.50')).toBeTruthy();
    expect(mockRunOcr).toHaveBeenCalledTimes(1);
    expect(mockRunOcr.mock.calls[0][0]).toEqual({
      base64: 'QUJD',
      mimeType: 'image/jpeg',
      requestId: IMAGE.requestId,
    });
    expect(useScanStore.getState().pendingImage).toBeNull();
  });

  it('tells the user when the text was cut off', async () => {
    mockRunOcr.mockImplementation((_variables, options) =>
      options.onSuccess({ scanId: 's1', text: 'LONG TEXT', path: 'u1/s1.txt', truncated: true })
    );
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});

    await screen.findByDisplayValue('LONG TEXT');
    expect(useToastStore.getState().message).toBe('That text was long — kept the first 20,000 characters.');
  });

  it('lets the user skip a slow scan and enter details manually', async () => {
    mockRunOcr.mockImplementation(() => {});
    useScanStore.getState().setPendingImage(IMAGE);

    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});

    expect(screen.getByText('Reading text…')).toBeTruthy();
    fireEvent.press(screen.getByText('Skip — enter manually'));
    expect(screen.getByText('Add Transaction')).toBeTruthy();
  });

  it('recognizes a completed withdrawal, selects Transfer and Cash, and requires From',async()=>{
    const receipt={schemaVersion:3,transactionType:'unknown',documentKind:'transfer',paymentStatus:'completed',merchant:'ATM',rows:[],totalCents:null,computedTotalCents:null,matchesTotal:null,droppedRowCount:0,cappedRowCount:0,transfer:{kind:'withdrawal',receivedCents:200000,feeCents:1500,totalDebitedCents:201500,requiresReview:false}};
    mockRunOcr.mockImplementation((_v,o)=>o.onSuccess({scanId:'s1',text:'Withdrawal',truncated:false,receipt}));useScanStore.getState().setPendingImage(IMAGE);
    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});
    expect(screen.getByText('Transfer').parent?.props.style).toBeDefined();
    expect(screen.getByLabelText('To account').props.value).toBe('Cash');expect(screen.getByLabelText('From account').props.value).toBe('');
    expect(screen.getByLabelText('Transfer amount').props.value).toBe('2,000.00');
    expect(screen.getByText('Total deducted: $2,015.00')).toBeTruthy();
    fireEvent.press(screen.getByText('Record transfer'));expect(mockTransferSave).not.toHaveBeenCalled();
  });
  it('goes to the form after checking for a draft when there is no image', async() => {
    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});

    expect(mockRunOcr).not.toHaveBeenCalled();
    expect(await screen.findByText('Add Transaction')).toBeTruthy();
  });

  it('ignores a pending image that belongs to a different visit (e.g. a crafted deep link)', async() => {
    useScanStore.getState().setPendingImage(IMAGE);
    mockParams = { visit: 'not-this-image' };

    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});

    expect(mockRunOcr).not.toHaveBeenCalled();
    expect(await screen.findByText('Add Transaction')).toBeTruthy();
  });

  it('offers recovery on the next visit without automatically overwriting the draft', async() => {
    mockParams = { visit: 'visit-1' };
    const { rerender } = render(<NewTransactionScreen />);
    await screen.findByText('Add Transaction');
    fireEvent.changeText(screen.getByPlaceholderText('0.00'), '42');
    expect(screen.getByDisplayValue('42')).toBeTruthy();

    mockParams = { visit: 'visit-2' };
    rerender(<NewTransactionScreen/>);

    await screen.findByText('Resume draft');
    expect(screen.queryByDisplayValue('42')).toBeNull();
    fireEvent.press(screen.getByText('Resume draft'));
    expect(screen.getByDisplayValue('42')).toBeTruthy();
  });

  it('ignores late OCR after Skip, preserving edits and suppressing success notifications', async () => {
    useScanStore.getState().setPendingImage(IMAGE);
    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});
    const callback = mockRunOcr.mock.calls[0][1];
    fireEvent.press(screen.getByText('Skip — enter manually'));
    fireEvent.changeText(screen.getByLabelText('Amount'), '42');
    fireEvent.changeText(screen.getByLabelText('Note'), 'My draft');
    act(() => callback.onSuccess({ scanId: 's1', text: 'LONG', truncated: true, receipt: null }));
    expect(screen.getByLabelText('Amount').props.value).toBe('42');
    expect(screen.getByLabelText('Note').props.value).toBe('My draft');
    expect(useToastStore.getState().message).toBeNull();
  });
  it('prefills receipt rows, merchant and manual total when rows are absent', async () => {
    const receipt = reconcileReceipt({ merchant: null, text: 'TOTAL 12.50', items: [], deductions: [], taxes: [], fees: [], total: 12.5 });
    mockRunOcr.mockImplementation((_variables, options) => options.onSuccess({ scanId: 's1', text: 'TOTAL 12.50', truncated: false, receipt }));
    useScanStore.getState().setPendingImage(IMAGE);
    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});
    expect(screen.getByLabelText('Note').props.value).toBe('');
    expect(screen.getByLabelText('Amount').props.value).toBe('12.50');
    expect(screen.getByText(/No items found/)).toBeTruthy();
  });
  it('reuses the transaction ID and timestamp when retrying a create', async() => {
    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});
    await screen.findByText('Add Transaction');
    fireEvent.changeText(screen.getByLabelText('Amount'), '42');
    fireEvent.press(screen.getByText('Add Transaction'));
    await waitFor(()=>expect(mockAddTransaction).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByText('Retry same save'));
    await waitFor(()=>expect(mockAddTransaction).toHaveBeenCalledTimes(2));
    expect(mockAddTransaction.mock.calls[0][0].id).toBe(mockAddTransaction.mock.calls[1][0].id);
    expect(mockAddTransaction.mock.calls[0][0].occurredAt).toBe(mockAddTransaction.mock.calls[1][0].occurredAt);
  });
  it('saves the selected income source with a scanned income receipt and retains it on retry', async () => {
    const receipt = reconcileReceipt({merchant:'Employer',text:'Salary credited',items:[],deductions:[],taxes:[],fees:[],total:1000,
      transactionType:'income',documentKind:'salary',paymentStatus:'completed',ownAccountTransfer:false,netReceived:1000});
    mockRunOcr.mockImplementation((_variables, options) => options.onSuccess({scanId:'s1',text:'Salary credited',truncated:false,receipt}));
    useScanStore.getState().setPendingImage(IMAGE);
    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});
    fireEvent.press(screen.getByText('Choose salary source'));
    fireEvent.press(screen.getByText('Add Transaction'));
    fireEvent.press(screen.getByText('Retry same save'));
    expect(mockAddTransaction).toHaveBeenCalledTimes(2);
    for (const [input] of mockAddTransaction.mock.calls) expect(input).toMatchObject({type:'income',amount:1000,incomeSourceId:'00000000-0000-4000-8000-000000000301'});
  });
  it('recovers an uncertain save after remount with the exact request ID and payload',async()=>{
    const first=render(<NewTransactionScreen/>);await screen.findByText('Add Transaction');
    fireEvent.changeText(screen.getByLabelText('Amount'),'42');fireEvent.press(screen.getByText('Add Transaction'));
    await waitFor(()=>expect(mockAddTransaction).toHaveBeenCalledTimes(1));const input=mockAddTransaction.mock.calls[0][0];first.unmount();
    mockParams={visit:'restarted'};render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});await screen.findByText('Resume draft');fireEvent.press(screen.getByText('Resume draft'));
    fireEvent.press(screen.getByText('Retry same save'));await waitFor(()=>expect(mockAddTransaction).toHaveBeenCalledTimes(2));expect(mockAddTransaction.mock.calls[1][0]).toEqual(input);
  });
  it('loads a repeat into the new form for review without creating a transaction or retaining payment references',async()=>{
    mockParams={visit:'repeat',repeatId:'00000000-0000-4000-8000-000000000100'};
    render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});await screen.findByText(/New copy for today/);
    expect(screen.getByLabelText('Amount').props.value).toBe('29');expect(screen.getByLabelText('Note').props.value).toBe('Repeat coffee');
    expect(screen.queryByLabelText('Reference')).toBeNull();expect(mockAddTransaction).not.toHaveBeenCalled();
  });
  it('recovers an interrupted item editor without saving its incomplete row as a transaction',async()=>{
    const first=render(<NewTransactionScreen/>);await screen.findByText('Add Transaction');fireEvent.press(screen.getByLabelText('Add item'));
    fireEvent.changeText(screen.getByLabelText('Row 1 label'),'Unfinished item');
    await waitFor(async()=>expect((await AsyncStorage.getAllKeys()).some(key=>key.includes('transaction-draft'))).toBe(true));first.unmount();
    mockParams={visit:'item-restart'};render(<NewTransactionScreen/>);await act(async()=>{await Promise.resolve();});await screen.findByText('Resume draft');fireEvent.press(screen.getByText('Resume draft'));
    expect(screen.getByText('Unfinished item')).toBeTruthy();expect(screen.getByText(/Row 1: enter a label/)).toBeTruthy();expect(mockAddTransaction).not.toHaveBeenCalled();
  });
});

jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodPicker:()=>null}));
