import {render,renderHook,screen,fireEvent,waitFor,act} from '@testing-library/react-native';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {BillPaymentForm} from '../../src/components/BillPaymentForm';
import {useProofDraft} from '../../src/components/TransactionAttachments';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {localDateKey} from '../../src/domain/transactionDates';
const owner='00000000-0000-4000-8000-000000000001';
const occurrence='00000000-0000-4000-8000-000000000002';
const mockBack=jest.fn(),mockRpc=jest.fn(),mockUpload=jest.fn(),mockPick=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({back:mockBack})}));
jest.mock('../../src/lib/prepareProofImage',()=>({prepareProofImage:jest.fn()}));
jest.mock('../../src/components/TransactionDateField',()=>({TransactionDateField:({value,onChange,accessibilityLabel}:any)=>{const {TextInput}=require('react-native');return <TextInput accessibilityLabel={accessibilityLabel} value={value} onChangeText={onChange}/>;}}));
jest.mock('../../src/lib/transactionAttachments',()=>({pickProofFile:()=>mockPick(),uploadProof:(...args:unknown[])=>mockUpload(...args)}));
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodPicker:({onChange}: {onChange:(id:string)=>void})=>{const {Text,Pressable}=require('react-native');return <Pressable accessibilityLabel="Choose payment method" onPress={()=>onChange('00000000-0000-4000-8000-000000000003')}><Text>Cash</Text></Pressable>;}}));
jest.mock('../../src/lib/supabase',()=>({supabase:{from:()=>{const chain={select:()=>chain,eq:()=>chain,single:async()=>({data:{id:occurrence,label:'Rent',scheduled_date:'2026-10-01',amount:'50.00',state:'outstanding',payment_method_id:null},error:null})};return chain;},rpc:(...args:unknown[])=>mockRpc(...args)}}));
beforeEach(()=>{jest.clearAllMocks();usePreferencesStore.getState().setProfile({user_id:owner,display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});mockRpc.mockImplementation(async(_name,p)=>({data:{transaction:{id:p.p_transaction_id}},error:null}));mockPick.mockResolvedValue({id:'proof',name:'receipt.webp',mime:'image/webp',bytes:new Uint8Array(12)});mockUpload.mockResolvedValue(undefined);});
let client:QueryClient;
afterEach(()=>{usePreferencesStore.getState().setProfile(null);client.clear();});
function mount(){client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity},mutations:{retry:false,gcTime:Infinity}}});return render(<QueryClientProvider client={client}><BillPaymentForm occurrenceId={occurrence}/></QueryClientProvider>);}
it('uses saved bill details and shows only payment method and an optional attachment',async()=>{
 mount();await screen.findByText('Rent');expect(screen.getByText(/50.00.*Due 2026-10-01/)).toBeTruthy();
 for(const label of ['Amount','Note','Transaction date','Income source'])expect(screen.queryByLabelText(label)).toBeNull();
 fireEvent.press(screen.getByLabelText('Choose payment method'));fireEvent.press(screen.getByLabelText('Record bill payment'));
 await waitFor(()=>expect(mockBack).toHaveBeenCalledTimes(1));expect(mockRpc).toHaveBeenCalledWith('pay_bill',expect.objectContaining({p_occurrence:occurrence,p_payment_method:'00000000-0000-4000-8000-000000000003',p_expected_amount:'50.00',p_expected_date:'2026-10-01',p_payment_date:localDateKey(new Date(),'UTC')}));
 expect(mockUpload).not.toHaveBeenCalled();
});
it('preserves the draft on insufficient funds and retries only the file after a saved payment',async()=>{
 mount();await screen.findByText('Rent');fireEvent.press(screen.getByLabelText('Add attachment'));await screen.findByText(/receipt.webp/);
 mockRpc.mockResolvedValueOnce({error:{code:'BT001'}});fireEvent.press(screen.getByLabelText('Record bill payment'));await screen.findByText('Insufficient balance. Choose another payment method.');
 expect(screen.getByText(/receipt.webp/)).toBeTruthy();expect(mockUpload).not.toHaveBeenCalled();
 mockUpload.mockRejectedValueOnce(new Error('Upload failed'));fireEvent.press(screen.getByLabelText('Record bill payment'));await screen.findByText('Upload failed');
 const ids=mockRpc.mock.calls.map(call=>call[1].p_transaction_id);expect(ids[0]).toBe(ids[1]);
 fireEvent.press(screen.getByText('Retry attachment'));await waitFor(()=>expect(mockBack).toHaveBeenCalledTimes(1));expect(mockRpc).toHaveBeenCalledTimes(2);expect(mockUpload).toHaveBeenCalledTimes(2);
});
it('allows an actual payment date override without editing the bill due date',async()=>{
 mount();await screen.findByText('Rent');
 expect(screen.queryByLabelText('Payment date')).toBeNull();
 fireEvent.press(screen.getByLabelText('Edit payment date'));
 fireEvent.changeText(screen.getByLabelText('Payment date'),'2026-09-30');
 fireEvent.press(screen.getByLabelText('Record bill payment'));
 await waitFor(()=>expect(mockRpc).toHaveBeenCalledWith('pay_bill',expect.objectContaining({p_expected_date:'2026-10-01',p_payment_date:'2026-09-30'})));
});
it('rejects future payment dates without sending a save request',async()=>{
 mount();await screen.findByText('Rent');fireEvent.press(screen.getByLabelText('Edit payment date'));
 fireEvent.changeText(screen.getByLabelText('Payment date'),'9999-12-31');fireEvent.press(screen.getByLabelText('Record bill payment'));
 await screen.findByText('Choose a payment date on or before today.');expect(mockRpc).not.toHaveBeenCalled();
});
it('binds an attachment draft when owner defaults arrive after a cold deep link',async()=>{
 const profile=usePreferencesStore.getState().profile!;usePreferencesStore.getState().setProfile(null);
 client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity}}});
 const {result}=renderHook(()=>useProofDraft(),{wrapper:({children})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
 act(()=>usePreferencesStore.getState().setProfile(profile));await act(async()=>{await result.current.choose();});
 expect(result.current.file?.name).toBe('receipt.webp');
 await act(async()=>{expect(await result.current.upload('transaction')).toBe(true);});expect(mockUpload).toHaveBeenCalledWith('transaction',expect.objectContaining({name:'receipt.webp'}),owner);
});
