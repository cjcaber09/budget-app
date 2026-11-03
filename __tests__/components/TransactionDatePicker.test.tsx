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

test('native display follows date preference while calendar changes keep ISO values',()=>{
 const {usePreferencesStore,defaultProfile}=require('../../src/stores/usePreferencesStore');
 const original=Platform.OS;Object.defineProperty(Platform,'OS',{value:'android',configurable:true});
 try{
  usePreferencesStore.getState().setProfile({...defaultProfile('test-owner'),date_format:'dmy'});
  const change=jest.fn(),view=render(<TransactionDateField value="2026-10-20" onChange={change}/>);
  expect(view.getByText('20/10/2026')).toBeTruthy();
  act(()=>usePreferencesStore.getState().setProfile({...defaultProfile('test-owner'),date_format:'mdy'}));
  expect(view.getByText('10/20/2026')).toBeTruthy();expect(change).not.toHaveBeenCalled();
 }finally{usePreferencesStore.getState().setProfile(null);Object.defineProperty(Platform,'OS',{value:original,configurable:true});}
});
