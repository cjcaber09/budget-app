import {fireEvent,render,screen} from '@testing-library/react-native';
import NewRecurringRuleScreen from '../../app/(tabs)/recurring/new';
const mockSave=jest.fn();let mockVisit='visit-one';
jest.mock('expo-router',()=>({useLocalSearchParams:()=>({visit:mockVisit}),useRouter:()=>({back:jest.fn()})}));
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodPicker:()=>null}));
jest.mock('../../src/hooks/useRecurringRules',()=>({useAddRecurringRule:()=>({mutate:mockSave,isPending:false})}));
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>({isPending:false,isError:false,data:[{id:'category',name:'Rent'}]})}));
beforeEach(()=>{mockSave.mockClear();mockVisit='visit-one';});
it('retries with one stable creation ID and resets it for a fresh visit',()=>{
 const {rerender}=render(<NewRecurringRuleScreen/>);
 fireEvent.changeText(screen.getByLabelText('Amount'),'50');fireEvent.press(screen.getByText('Add Recurring Bill'));fireEvent.press(screen.getByText('Add Recurring Bill'));
 const first=mockSave.mock.calls[0][0];expect(first.createId).toMatch(/^[\da-f-]{36}$/);expect(mockSave.mock.calls[1][0].createId).toBe(first.createId);
 mockVisit='visit-two';rerender(<NewRecurringRuleScreen/>);
 expect(screen.getByLabelText('Amount').props.value).toBe('');
 fireEvent.changeText(screen.getByLabelText('Amount'),'50');fireEvent.press(screen.getByText('Add Recurring Bill'));
 expect(mockSave.mock.calls[2][0].createId).not.toBe(first.createId);
});
