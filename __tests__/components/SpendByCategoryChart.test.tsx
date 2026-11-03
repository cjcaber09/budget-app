import {fireEvent,render,screen} from '@testing-library/react-native';
import {SpendByCategoryChart} from '../../src/components/SpendByCategoryChart';
const categories=[{key:'food',id:'food',name:'Food',color:'#55816A',spent:7500,budget:null,count:1},{key:'uncategorized',id:null,name:'Uncategorized',color:'#888888',spent:2500,budget:null,count:1}];
test('doughnut shows complete exact total and keeps category shares and navigation',()=>{
 const select=jest.fn();render(<SpendByCategoryChart reportCategories={categories} expenseCents={10000} onSelect={select}/>);
 expect(screen.getByText('Net expenses')).toBeTruthy();expect(screen.getByText('$100.00')).toBeTruthy();expect(screen.getByText('75%')).toBeTruthy();expect(screen.getByText('25%')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('View Uncategorized spending'));expect(select).toHaveBeenCalledWith('uncategorized');
});
test('negative net categories suppress misleading percentages and preserve exact refund values',()=>{
 render(<SpendByCategoryChart reportCategories={[...categories,{key:'refund',id:'refund',name:'Refund category',color:'#888888',spent:-500,budget:null,count:1}]} expenseCents={9500}/>);
 expect(screen.queryByText('Net expenses')).toBeNull();expect(screen.getByText(/Refunds exceed spending/)).toBeTruthy();expect(screen.getByText('-$5.00')).toBeTruthy();expect(screen.queryByText('75%')).toBeNull();
});
test('missing totals and zero expenses keep recovery and empty states',()=>{
 const view=render(<SpendByCategoryChart reportCategories={categories}/>);expect(screen.getByText(/until totals refresh/)).toBeTruthy();expect(screen.queryByText('Net expenses')).toBeNull();
 view.rerender(<SpendByCategoryChart reportCategories={categories.map(c=>({...c,spent:0}))} expenseCents={0}/>);expect(screen.getByText('No net expenses in this month.')).toBeTruthy();
});
