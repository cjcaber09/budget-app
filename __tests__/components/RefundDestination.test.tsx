import {fireEvent,render,screen} from '@testing-library/react-native';
import {RefundDestination} from '../../src/components/RefundDestination';
import type {PaymentMethod} from '../../src/domain/paymentMethods';

test('many destinations stay hidden until requested, search disambiguates cards, and archived selection is retained',()=>{
 const methods=Array.from({length:20},(_,i)=>({id:String(i),method:'card',name:'Same bank',payment_type:'Debit card',last_four:String(1000+i),archived:i===0})) as PaymentMethod[];
 const choose=jest.fn();
 render(<RefundDestination label="Received into" methods={methods} value="0" onChange={choose} disabled={false}/>);
 expect(screen.getByText(/1000.*Archived/)).toBeTruthy();
 expect(screen.queryByText(/1019/)).toBeNull();
 fireEvent.press(screen.getByLabelText(/Change refund destination/));
 fireEvent.changeText(screen.getByLabelText('Search refund destinations'),'1019');
 fireEvent.press(screen.getByText(/1019/));
 expect(choose).toHaveBeenCalledWith('19');
 expect(screen.queryByLabelText('Search refund destinations')).toBeNull();
});
