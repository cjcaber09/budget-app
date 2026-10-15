import {useState} from 'react';
import {fireEvent,render,screen} from '@testing-library/react-native';
import {MoneyInput} from '../../src/components/MoneyInput';

test('edits raw digits without controlling selection and groups only after blur',()=>{
 const changed=jest.fn(),focus=jest.fn(),blur=jest.fn();
 function Form(){const [value,setValue]=useState('1000.00');return <MoneyInput accessibilityLabel="Amount" value={value} onFocus={focus} onBlur={blur} onChangeText={next=>{changed(next);setValue(next);}}/>;}
 render(<Form/>);const input=()=>screen.getByLabelText('Amount');
 expect(input().props.value).toBe('1,000.00');fireEvent(input(),'focus',{});expect(input().props.value).toBe('1000.00');
 expect(changed).not.toHaveBeenCalled();expect(focus).toHaveBeenCalledTimes(1);
 fireEvent(input(),'selectionChange',{nativeEvent:{selection:{start:2,end:2}}});fireEvent.changeText(input(),'10900.00');
 expect(input().props.value).toBe('10900.00');expect(input().props.selection).toBeUndefined();expect(changed).toHaveBeenLastCalledWith('10900.00');
 fireEvent(input(),'blur',{});expect(input().props.value).toBe('10,900.00');expect(blur).toHaveBeenCalledTimes(1);expect(changed).toHaveBeenCalledTimes(1);
 fireEvent(input(),'focus',{});expect(input().props.value).toBe('10900.00');expect(changed).toHaveBeenCalledTimes(1);
});
test.each(['1234.','1234.00','-1234.50','-','.','bad'])('preserves raw draft %s through focus and blur',value=>{
 const changed=jest.fn();render(<MoneyInput accessibilityLabel="Amount" value={value} onChangeText={changed}/>);
 fireEvent(screen.getByLabelText('Amount'),'focus',{});expect(screen.getByLabelText('Amount').props.value).toBe(value);
 fireEvent(screen.getByLabelText('Amount'),'blur',{});expect(changed).not.toHaveBeenCalled();
});
test('comma paste and external clearing retain the raw parent contract',()=>{
 const changed=jest.fn(),view=render(<MoneyInput accessibilityLabel="Amount" value="1234.50" onChangeText={changed}/>);
 fireEvent(screen.getByLabelText('Amount'),'focus',{});fireEvent.changeText(screen.getByLabelText('Amount'),'12,345.00');expect(changed).toHaveBeenLastCalledWith('12345.00');
 view.rerender(<MoneyInput accessibilityLabel="Amount" value="" onChangeText={changed}/>);expect(screen.getByLabelText('Amount').props.value).toBe('');expect(screen.getByLabelText('Amount').props.selection).toBeUndefined();
});
test('read-only amounts remain grouped even if a focus event arrives',()=>{
 render(<MoneyInput accessibilityLabel="Amount" value="1234.00" editable={false} onChangeText={jest.fn()}/>);fireEvent(screen.getByLabelText('Amount'),'focus',{});expect(screen.getByLabelText('Amount').props.value).toBe('1,234.00');
});
