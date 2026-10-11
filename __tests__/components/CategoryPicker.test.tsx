import {fireEvent,render,screen} from '@testing-library/react-native';
import {CategoryPicker} from '../../src/components/CategoryPicker';
const categories=[{id:'groceries',user_id:'owner',name:'Groceries',color:'#55816A',icon:'cart',is_default:false},{id:'rent',user_id:'owner',name:'Rent',color:'#55816A',icon:'home',is_default:false}];
it('keeps optional choices out of the form, supports search and closes after selection',()=>{
 const select=jest.fn();render(<CategoryPicker compact categories={categories} value="groceries" onChange={select}/>);
 expect(screen.queryByText('Rent')).toBeNull();fireEvent.press(screen.getByLabelText('Choose category'));
 fireEvent.changeText(screen.getByLabelText('Search categories'),' ReNt ');
 expect(screen.queryByLabelText('Select category Groceries')).toBeNull();
 fireEvent.press(screen.getByLabelText('Select category Rent'));
 expect(select).toHaveBeenCalledWith('rent');expect(screen.queryByLabelText('Search categories')).toBeNull();
});
