import {useState} from 'react';
import {fireEvent,render,screen} from '@testing-library/react-native';
import {TransferAccountAutocomplete} from '../../src/components/TransferAccountAutocomplete';
import {paymentMethodLabel,type PaymentMethod} from '../../src/domain/paymentMethods';

const cash:PaymentMethod={id:'cash',user_id:'owner',method:'cash',name:'Cash',payment_type:'Cash',last_four:null,opening_balance:'0.00',balance:'0.00',baseline_at:null,archived:false,has_activity:false,related_bills:[]};
const card:PaymentMethod={...cash,id:'card',method:'card',name:'Metrobank',payment_type:'Debit card',last_four:'8035'};
const second:PaymentMethod={...card,id:'second',last_four:'1234'};
const archived:PaymentMethod={...card,id:'archived',name:'Old bank',archived:true};
const changed=jest.fn(),created=jest.fn();
function Harness({initial='',excludedId='',disabled=false}:{initial?:string;excludedId?:string;disabled?:boolean}){
 const [value,setValue]=useState(initial),[open,setOpen]=useState(false);
 return <TransferAccountAutocomplete label="From account" value={value} excludedId={excludedId} methods={[cash,card,second,archived]} open={open} disabled={disabled}
  onOpen={()=>setOpen(true)} onClose={()=>setOpen(false)} onChange={id=>{changed(id);setValue(id);}} onCreate={created}/>;
}
beforeEach(()=>jest.clearAllMocks());

test('filters suggestions by name and last four, and only commits a selected account',()=>{
 render(<Harness/>);const input=screen.getByLabelText('From account');
 fireEvent(input,'focus');expect(input.props.accessibilityState.expanded).toBe(true);
 fireEvent.changeText(input,'METRO');expect(screen.queryByText('Cash · Cash')).toBeNull();expect(screen.getByText(paymentMethodLabel(card))).toBeTruthy();
 fireEvent.changeText(input,'8035');expect(screen.queryByText(paymentMethodLabel(second))).toBeNull();expect(changed).not.toHaveBeenCalled();
 fireEvent.press(screen.getByLabelText('Select from account '+paymentMethodLabel(card)));
 expect(changed).toHaveBeenLastCalledWith(card.id);expect(input.props.value).toBe(card.name);expect(screen.getByText('Debit card · ****8035')).toBeTruthy();expect(input.props.accessibilityState.expanded).toBe(false);
});

test('excludes the opposite account and archived new choices; allows creating from no matches',()=>{
 render(<Harness excludedId={cash.id}/>);const input=screen.getByLabelText('From account');fireEvent(input,'focus');
 expect(screen.queryByText(paymentMethodLabel(cash))).toBeNull();expect(screen.queryByText(paymentMethodLabel(archived)+' · Archived')).toBeNull();
 fireEvent.changeText(input,'no such account');expect(screen.getByText('No matching accounts.')).toBeTruthy();
 fireEvent.press(screen.getByText('Add payment method'));expect(created).toHaveBeenCalledTimes(1);expect(changed).not.toHaveBeenCalled();
});

test('editing a selected label clears the old account ID and unmatched text cannot stay selected',()=>{
 render(<Harness initial={card.id}/>);const input=screen.getByLabelText('From account');expect(input.props.value).toBe(card.name);
 fireEvent(input,'focus');fireEvent.changeText(input,'Different bank');expect(changed).toHaveBeenLastCalledWith('');
 fireEvent(input,'blur');expect(input.props.value).toBe('Different bank');expect(screen.getByText('Choose an account from the suggestions.')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Clear from account'));expect(input.props.value).toBe('');
});

test('keyboard arrows and explicit submission select a suggestion; Escape dismisses without selecting',()=>{
 render(<Harness/>);const input=screen.getByLabelText('From account');fireEvent(input,'focus');
 fireEvent(input,'submitEditing');expect(changed).not.toHaveBeenCalled();
 fireEvent(input,'keyPress',{nativeEvent:{key:'ArrowUp'},preventDefault:jest.fn()});fireEvent(input,'submitEditing');
 expect(changed).toHaveBeenLastCalledWith(second.id);
 fireEvent(input,'focus');fireEvent(input,'keyPress',{nativeEvent:{key:'Escape'}});expect(input.props.accessibilityState.expanded).toBe(false);
});

test('an existing archived choice remains visible and a locked field cannot change it',()=>{
 render(<Harness initial={archived.id} disabled/>);const input=screen.getByLabelText('From account');
 expect(input.props.value).toBe(archived.name);expect(input.props.editable).toBe(false);expect(screen.getByText('Debit card · ****8035 · Archived')).toBeTruthy();
 fireEvent.changeText(input,'Cash');fireEvent(input,'focus');fireEvent.press(screen.getByLabelText('Clear from account'));
 expect(changed).not.toHaveBeenCalled();expect(input.props.accessibilityState.expanded).toBe(false);
});
