import {fireEvent,render,screen} from '@testing-library/react-native';
import {UpcomingBillsBell} from '../../src/components/UpcomingBillsBell';
jest.mock('../../src/components/UpcomingBillList',()=>({UpcomingBillList:()=>{const {Text}=require('react-native');return <Text>Bill list content</Text>;}}));
const query={data:{month:'2026-10-01',bills:[{state:'outstanding'}]},isPending:false,isError:false,refetch:jest.fn()} as any;
test('upcoming dot and list appear through an unframed bell',()=>{
 render(<UpcomingBillsBell query={query}/>);expect(screen.getByTestId('upcoming-bills-dot')).toBeTruthy();expect(screen.queryByText('Bill list content')).toBeNull();fireEvent.press(screen.getByLabelText('Upcoming bills'));expect(screen.getByText('Bill list content')).toBeTruthy();fireEvent.press(screen.getByLabelText('Close upcoming bills'));expect(screen.queryByText('Bill list content')).toBeNull();
});
test('settled and skipped bills do not produce a dot',()=>{
 render(<UpcomingBillsBell query={{...query,data:{month:'2026-10-01',bills:[{state:'recorded'},{state:'skipped'}]}} as any}/>);expect(screen.queryByTestId('upcoming-bills-dot')).toBeNull();
});
