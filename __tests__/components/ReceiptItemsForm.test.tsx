import { render, screen, fireEvent } from '@testing-library/react-native';
import { TransactionForm } from '../../src/components/TransactionForm';
import { reconcileReceipt, type TransactionItemInput } from '../../supabase/functions/ocr/shared';
const categories = [{ id: 'cat', user_id: 'u', name: 'Groceries', color: '#55816A', icon: 'cart', is_default: true }];
const item: TransactionItemInput = { kind: 'item', label: 'Bread', amountCents: 1000, quantity: '2', unitPriceCents: 500, taxIncluded: false };
function mount(items = [item], total = 12) {
  const onSubmit = jest.fn();
  const receipt = reconcileReceipt({ merchant: 'Shop', text: 'Receipt', items: [], taxes: [], deductions: [], fees: [], total });
  receipt.rows = items;
  render(<TransactionForm categories={categories} initialValues={{ amount: '10', items }} receipt={receipt} submitLabel="Save" onSubmit={onSubmit} />);
  return onSubmit;
}
it('computes read-only amount and uses the current difference for a single adjustment', () => {
  const save = mount();
  expect(screen.getByLabelText('Amount').props.editable).toBe(false);
  fireEvent.press(screen.getByLabelText('Edit row 1'));
  fireEvent.changeText(screen.getByLabelText('Row 1 amount'), '11');
  fireEvent.press(screen.getByText('Save item'));
  fireEvent.press(screen.getByText('Add $1.00 adjustment'));
  expect(screen.getByLabelText('Amount').props.value).toBe('12.00');
  expect(screen.queryByText(/^(Add|Subtract) \$.* adjustment$/)).toBeNull();
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0]).toMatchObject({ amount: 12, items: [{ ...item, amountCents: 1100 }, { kind: 'adjustment', amountCents: 100 }] });
});
it('applies a negative adjustment once', () => {
  const save = mount([item], 8);
  fireEvent.press(screen.getByText('Subtract $2.00 adjustment'));
  expect(screen.getByLabelText('Amount').props.value).toBe('8.00');
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0].items[1].amountCents).toBe(-200);
});
it('hides a free scanned item and blocks an entirely zero-valued transaction',()=>{
  const free={...item,label:'Free item',amountCents:0,unitPriceCents:0};
  const save=mount([free],0);
  expect(screen.getByLabelText('Amount').props.value).toBe('0.00');
  expect(screen.queryByText('Free item')).toBeNull();
  expect(screen.getByText('0 rows')).toBeTruthy();
  expect(screen.getByText('No nonzero items to show. Add an item to continue.')).toBeTruthy();
  fireEvent.press(screen.getByText('Save'));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText('Rows must add up to a positive amount within the supported range.')).toBeTruthy();
});
it('hides zero items and fees while retaining the correct edit target, stored rows and nonzero adjustments',()=>{
  const free={...item,label:'Free item',amountCents:0,unitPriceCents:0};
  const fee:TransactionItemInput={kind:'fee',label:'No fee',amountCents:0,quantity:null,unitPriceCents:null,taxIncluded:false};
  const adjustment:TransactionItemInput={...fee,kind:'adjustment',label:'Correction',amountCents:-100};
  const save=mount([free,item,fee,adjustment],9);
  expect(screen.queryByText('Free item')).toBeNull();expect(screen.queryByText('No fee')).toBeNull();
  expect(screen.getByText('2 rows')).toBeTruthy();expect(screen.getByText('Correction')).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Edit row 2'));
  expect(screen.getByLabelText('Row 2 label').props.value).toBe('Bread');
  fireEvent.changeText(screen.getByLabelText('Row 2 amount'),'11');fireEvent.press(screen.getByText('Save item'));
  expect(screen.getByLabelText('Amount').props.value).toBe('10.00');
  fireEvent.press(screen.getByText('Save'));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({amount:10,items:[free,{...item,amountCents:1100},fee,adjustment]}));
});
it('lets users clear hidden zero rows at the row limit so new items remain possible',()=>{
  const free={...item,label:'Free item',amountCents:0};
  mount([...Array.from({length:99},()=>free),item],10);
  expect(screen.getAllByLabelText(/^Edit row \d+$/)).toHaveLength(1);
  fireEvent.press(screen.getByLabelText('Remove zero-value rows'));
  expect(screen.queryByText(/100-row limit/)).toBeNull();
  fireEvent.press(screen.getByLabelText('Add item'));
  expect(screen.getByLabelText('Row 2 label')).toBeTruthy();
});
it('keeps an unfinished zero row reachable until its validation issue is fixed',()=>{
  mount([{...item,label:'',amountCents:0},item],10);
  fireEvent.press(screen.getByLabelText('Edit row 1'));
  fireEvent.changeText(screen.getByLabelText('Row 1 label'),'Free item');
  fireEvent.press(screen.getByText('Save item'));
  expect(screen.queryByLabelText('Edit row 1')).toBeNull();
  expect(screen.getByLabelText('Edit row 2')).toBeTruthy();
  expect(screen.getByText('1 row')).toBeTruthy();
});
it('preserves and submits rows across income switching', () => {
  const save = mount();
  fireEvent.press(screen.getByText('Income'));
  fireEvent.press(screen.getByLabelText('Edit row 1'));
  expect(screen.getByLabelText('Row 1 label').props.value).toBe('Bread');
  fireEvent.press(screen.getByText('Cancel'));
  fireEvent.press(screen.getByText('Save'));
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'income', items: [item] }));
  fireEvent.press(screen.getByText('Expense'));
  fireEvent.press(screen.getByLabelText('Edit row 1'));
  expect(screen.getByLabelText('Row 1 label').props.value).toBe('Bread');
  fireEvent.press(screen.getByText('Cancel'));
});
it('blocks invalid rows and preserves the last valid total after removing the last row', () => {
  const save = mount();
  fireEvent.press(screen.getByLabelText('Edit row 1'));
  fireEvent.changeText(screen.getByLabelText('Row 1 label'), '');
  fireEvent.press(screen.getByText('Save item'));
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByText(/Enter a label/)).toBeTruthy();
  fireEvent.press(screen.getByLabelText('Remove row 1'));
  expect(screen.getByLabelText('Amount').props.editable).toBe(true);
  expect(screen.getByLabelText('Amount').props.value).toBe('10.00');
});
it('disables row additions and adjustments at the combined row cap', () => {
  mount(Array.from({ length: 100 }, () => item), 1001);
  fireEvent.press(screen.getByLabelText('Add item'));
  expect(screen.getAllByLabelText(/^Edit row \d+$/)).toHaveLength(100);
  expect(screen.getByText(/100-row limit/)).toBeTruthy();
  expect(screen.getByText('Remove a row before adding an adjustment.')).toBeTruthy();
});
it('keeps included VAT excluded from the amount when the selected Tax kind is tapped again', () => {
  const tax: TransactionItemInput = { kind: 'tax', label: 'VAT', amountCents: 200, quantity: null, unitPriceCents: null, taxIncluded: true };
  const save = mount([item, tax], 10);
  fireEvent.press(screen.getByLabelText('Edit row 2'));
  fireEvent.press(screen.getByLabelText('Row 2: Tax'));
  fireEvent.press(screen.getByLabelText('Row 2: Tax'));
  expect(screen.getByLabelText('Amount').props.value).toBe('10.00');
  expect(screen.getByLabelText('Row 2 tax included').props.value).toBe(true);
  fireEvent.press(screen.getByText('Save item'));
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0].items[1]).toEqual(tax);
});
it('keeps subtract adjustments negative on repeat selected-kind taps and clears metadata on an actual kind change', () => {
  const adjustment: TransactionItemInput = { kind: 'adjustment', label: 'Correction', amountCents: -200, quantity: null, unitPriceCents: null, taxIncluded: false };
  const save = mount([item, adjustment], 8);
  fireEvent.press(screen.getByLabelText('Edit row 2'));
  fireEvent.press(screen.getByLabelText('Row 2: Adjustment'));
  fireEvent.press(screen.getByLabelText('Row 2: Adjustment'));
  fireEvent.press(screen.getByText('Save item'));
  expect(screen.getByLabelText('Amount').props.value).toBe('8.00');
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[0][0].items[1].amountCents).toBe(-200);
  fireEvent.press(screen.getByLabelText('Edit row 1'));
  fireEvent.press(screen.getByLabelText('Row 1: Fee'));
  fireEvent.press(screen.getByText('Save item'));
  fireEvent.press(screen.getByText('Save'));
  expect(save.mock.calls[1][0].items[0]).toMatchObject({ kind: 'fee', quantity: null, unitPriceCents: null, taxIncluded: false });
});
