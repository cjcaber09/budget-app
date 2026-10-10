import {act,render} from '@testing-library/react-native';
import {Platform} from 'react-native';
import {TransactionDateField} from '../../src/components/TransactionDateField';
test('web uses a date input, opens its picker and accepts only valid calendar dates',()=>{
 const original=Platform.OS;Object.defineProperty(Platform,'OS',{value:'web',configurable:true});
 try{
  const change=jest.fn();const view=render(<TransactionDateField value="2026-10-08" onChange={change}/>);
  const input=view.UNSAFE_getByType('input' as any);expect(input.props.type).toBe('date');const showPicker=jest.fn();act(()=>input.props.onClick({currentTarget:{showPicker}}));expect(showPicker).toHaveBeenCalled();act(()=>input.props.onChange({currentTarget:{value:'2026-10-09'}}));expect(change).toHaveBeenCalledWith('2026-10-09');act(()=>input.props.onChange({currentTarget:{value:'2026-02-31'}}));expect(change).toHaveBeenCalledTimes(1);
 }finally{Object.defineProperty(Platform,'OS',{value:original,configurable:true});}
});
