import {fireEvent,render,screen} from '@testing-library/react-native';
import {Keyboard} from 'react-native';
import {CategoryPicker} from '../../src/components/CategoryPicker';
import type {Category} from '../../src/types/database';
test('dismisses the amount keyboard before opening and after selecting a searched category',()=>{
 const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{}),change=jest.fn();
 render(<CategoryPicker compact value="food" categories={[{id:'food',name:'Food'},{id:'travel',name:'Travel'}] as Category[]} onChange={change}/>);
 fireEvent.press(screen.getByLabelText('Choose category'));expect(dismiss).toHaveBeenCalledTimes(1);
 fireEvent.changeText(screen.getByLabelText('Search categories'),'Trav');
 fireEvent.press(screen.getByLabelText('Select category Travel'));
 expect(change).toHaveBeenCalledWith('travel');expect(dismiss).toHaveBeenCalledTimes(2);
 expect(screen.queryByLabelText('Search categories')).toBeNull();dismiss.mockRestore();
});
