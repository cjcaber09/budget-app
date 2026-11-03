import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import {Pressable,Text} from 'react-native';
import {TransactionForm} from '../../src/components/TransactionForm';
const categories=[{id:'00000000-0000-4000-8000-000000000010',user_id:'owner',name:'Food',color:'#55816A',icon:'tag',is_default:true}];
test('unresolved voice direction cannot silently become Expense',()=>{
 const save=jest.fn();render(<TransactionForm categories={categories} unresolvedType initialValues={{amount:'20',categoryId:''}} submitLabel="Save" onSubmit={save}/>);
 fireEvent.press(screen.getByText('Save'));expect(save).not.toHaveBeenCalled();
 expect(screen.getByText(/Choose Income or Expense/)).toBeTruthy();
});
test('untouched known-type proposal persists its payment review requirement until explicitly chosen',async()=>{
 const save=jest.fn(),draft=jest.fn();
 render(<TransactionForm categories={categories} persistInitial requirePaymentChoice initialValues={{type:'expense',amount:'20',categoryId:categories[0].id}} onDraftChange={draft} paymentMethodControl={(_value,onChange)=><Pressable onPress={()=>onChange(null)}><Text>Choose Cash explicitly</Text></Pressable>} submitLabel="Save" onSubmit={save}/>);
 await waitFor(()=>expect(draft).toHaveBeenCalledWith(expect.objectContaining({reviewRequired:{paymentMethod:true,incomeSource:false}})));
 fireEvent.press(screen.getByText('Save'));expect(save).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Choose Cash explicitly'));fireEvent.press(screen.getByText('Save'));
 expect(save).toHaveBeenCalledWith(expect.objectContaining({amount:20,paymentMethodId:null}));
});
test('switching an unresolved income source to Expense clears the irrelevant source requirement',()=>{
 const save=jest.fn();render(<TransactionForm categories={categories} requireSourceChoice initialValues={{type:'income',amount:'20',categoryId:categories[0].id}} submitLabel="Save" onSubmit={save}/>);
 fireEvent.press(screen.getByText('Save'));expect(save).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Expense'));fireEvent.press(screen.getByText('Save'));expect(save).toHaveBeenCalledWith(expect.objectContaining({type:'expense',incomeSourceId:null}));
});
