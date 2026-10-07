import { render,screen,fireEvent } from '@testing-library/react-native';
import { TransactionForm } from '../../src/components/TransactionForm';
import { reconcileReceipt, type ExtractedReceipt } from '../../supabase/functions/ocr/shared';
const categories=[{id:'cat',user_id:'u',name:'Groceries',color:'#55816A',icon:'cart',is_default:true}];
function receipt(changes:Partial<ExtractedReceipt>={}) {
  return reconcileReceipt({merchant:'Employer',text:'Salary credited',items:[],deductions:[],taxes:[],fees:[],total:null,
    transactionType:'income',documentKind:'salary',paymentStatus:'completed',classificationReason:'Salary credited',ownAccountTransfer:false,
    paymentDetails:{documentKind:'salary',fromName:'Employer',fromNumber:'0912 *** 0042',fromNumberType:'phone',reference:'000123'},
    paymentSummary:{label:'Salary payment',amount:1000,basis:'principal'},principal:1000,netReceived:1000,totalDebited:null,receiptDate:'2026-09-01',receiptDateRaw:'September 1, 2026',...changes});
}
function mount(changes:Partial<ExtractedReceipt>={}) {
  const save=jest.fn(); const discard=jest.fn();
  render(<TransactionForm categories={categories} receipt={receipt(changes)} scanned scanDate="2026-10-07" onDiscard={discard} submitLabel="Save" onSubmit={save}/>);
  return {save,discard};
}
it('autofills income, separate sender identifiers and date, and counts the repeated amount once',()=>{
  const {save}=mount();
  expect(screen.getByLabelText('From number').props.value).toBe('0912 *** 0042');
  expect(screen.getByLabelText('Payment amount').props.value).toBe('1000.00');
  expect(screen.getByLabelText('Amount').props.value).toBe('1000.00');
  expect(screen.getByText('2026-09-01')).toBeTruthy();
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0]).toMatchObject({type:'income',amount:1000,transactionDate:'2026-09-01',paymentDetails:{fromNumber:'0912 *** 0042'}});
  expect(save.mock.calls[0][0].items).toHaveLength(1);
});
it('links edits from both amount fields and recreates a removed summary while preserving sender data',()=>{
  const {save}=mount();
  fireEvent.changeText(screen.getByLabelText('Payment amount'),'1200');
  fireEvent.press(screen.getByLabelText('Edit row 1'));
  expect(screen.getByLabelText('Row 1 amount').props.value).toBe('1200');
  fireEvent.changeText(screen.getByLabelText('Row 1 amount'),'1100');
  fireEvent.press(screen.getByText('Save item'));
  expect(screen.getByLabelText('Payment amount').props.value).toBe('1100');
  fireEvent.press(screen.getByLabelText('Edit row 1'));fireEvent.press(screen.getByLabelText('Remove row 1'));
  expect(screen.getByLabelText('Payment amount').props.value).toBe('');
  expect(screen.getByLabelText('From name').props.value).toBe('Employer');
  fireEvent.changeText(screen.getByLabelText('Payment amount'),'900');
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0]).toMatchObject({amount:900,items:[{isPaymentSummary:true,amountCents:90000}]});
});
it('shows a breakdown payment without permitting a duplicate counted summary',()=>{
  const {save}=mount({paymentSummary:null,netReceived:900,items:[{name:'Gross salary',amount:1000}],deductions:[{label:'Withholding',amount:100}]});
  expect(screen.getByLabelText('Payment amount').props.value).toBe('900.00');
  expect(screen.getByLabelText('Payment amount').props.editable).toBe(false);
  fireEvent.changeText(screen.getByLabelText('Payment amount'),'900');
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0]).toMatchObject({amount:900});
  expect(save.mock.calls[0][0].items).toHaveLength(2);
});
it('uses scan date when printed date is absent and permits native date correction',()=>{
  const {save}=mount({receiptDate:null,receiptDateRaw:null});
  expect(screen.getByText('2026-10-07')).toBeTruthy();
  expect(screen.getByText(/No receipt date found/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Change transaction date'));
  fireEvent(screen.getByTestId('native-date-picker'),'valueChange',{},new Date(2026,8,2,12));
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0].transactionDate).toBe('2026-09-02');
});
it('leaves own-account direction unresolved and offers skipping without saving',()=>{
  const {save,discard}=mount({ownAccountTransfer:true});
  expect(screen.getByLabelText('Amount').props.value).toBe('');
  fireEvent.press(screen.getByText('Save')); expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Skip recording this transaction')); expect(discard).toHaveBeenCalled();
  fireEvent.press(screen.getByText('Income')); fireEvent.press(screen.getByText('Save'));
  expect(save).toHaveBeenCalled();
});
it('does not turn failed payments into completed ones by choosing a type',()=>{
  const {save}=mount({paymentStatus:'failed'});
  fireEvent.press(screen.getByText('Income')); fireEvent.press(screen.getByText('Save'));
  expect(save).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Enter a transaction manually'));
  fireEvent.press(screen.getByText('Income')); fireEvent.changeText(screen.getByLabelText('Amount'),'25'); fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0]).toMatchObject({type:'income',amount:25,transactionDate:'2026-10-07',paymentDetails:null,items:[]});
});
it('keeps already-reflected fees informational and blocks unclear fee impact until chosen',()=>{
  const {save}=mount({paymentSummary:{label:'Net received',amount:990,basis:'net'},netReceived:990,fees:[{label:'Fee',amount:10,chargedTo:'recipient',alreadyReflected:true}]});
  expect(screen.getByLabelText('Amount').props.value).toBe('990.00');
  fireEvent.press(screen.getByText('Save')); expect(save.mock.calls[0][0].amount).toBe(990);
});
it('restores the current income total after type changes and removing every row',()=>{
  const {save}=mount({transactionType:'expense',netReceived:90,totalDebited:110,paymentSummary:{label:'Payment',amount:100,basis:'principal'},fees:[{label:'Fee',amount:10,chargedTo:'unknown',alreadyReflected:false}]});
  fireEvent.press(screen.getByLabelText('Edit row 2'));
  fireEvent.press(screen.getByLabelText('Row 2: Include in total'));
  fireEvent.press(screen.getByText('Save item'));
  expect(screen.getByLabelText('Amount').props.value).toBe('110.00');
  fireEvent.press(screen.getByText('Income'));
  fireEvent.press(screen.getByLabelText('Edit row 2'));
  fireEvent.press(screen.getByLabelText('Row 2: Include in total'));
  fireEvent.press(screen.getByText('Save item'));
  expect(screen.getByLabelText('Amount').props.value).toBe('90.00');
  fireEvent.press(screen.getByLabelText('Edit row 1'));fireEvent.press(screen.getByLabelText('Remove row 1')); fireEvent.press(screen.getByLabelText('Edit row 1'));fireEvent.press(screen.getByLabelText('Remove row 1'));
  expect(screen.getByLabelText('Amount').props.value).toBe('90.00');
  fireEvent.press(screen.getByText('Save')); expect(save.mock.calls[0][0].amount).toBe(90);
});
