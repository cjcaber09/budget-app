import {render,screen,fireEvent,waitFor} from '@testing-library/react-native';
import {useExpenseBalanceReview} from '../../src/components/ExpenseBalanceReview';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {Pressable,Text} from 'react-native';
const mockProceed=jest.fn(),mockRefresh=jest.fn();
const method={id:'cash',user_id:'owner',method:'cash',payment_type:'Cash',name:'Cash',baseline_at:'2026-10-01T00:00:00Z',balance:'20.00'};
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:[method],refetch:mockRefresh})}));
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodDialog:()=>null}));
function Harness(){const review=useExpenseBalanceReview();return <><Pressable onPress={()=>void review.review({type:'expense',amount:50,paymentMethodId:null},mockProceed)}><Text>Save expense</Text></Pressable><review.Controls/></>;}
beforeEach(()=>{mockProceed.mockClear();mockRefresh.mockResolvedValue({data:{owner:'owner',timezone:'UTC',methods:[method]},isError:false});usePreferencesStore.getState().setProfile({user_id:'owner',display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});});
afterEach(()=>usePreferencesStore.getState().setProfile(null));
it('requires an explicit Record anyway choice and keeps it available for a failed save retry',async()=>{
 render(<Harness/>);fireEvent.press(screen.getByText('Save expense'));
 await screen.findByText('Record anyway');expect(mockProceed).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Record anyway'));expect(mockProceed).toHaveBeenCalledTimes(1);
 fireEvent.press(screen.getByText('Record anyway'));expect(mockProceed).toHaveBeenCalledTimes(2);
});
it('can return to editing without saving and offers balance correction',async()=>{
 render(<Harness/>);fireEvent.press(screen.getByText('Save expense'));await screen.findByText('Correct balance');
 fireEvent.press(screen.getByText('Back to expense'));expect(screen.queryByText('Record anyway')).toBeNull();expect(mockProceed).not.toHaveBeenCalled();
});
it('warns when balances fail to refresh instead of silently assuming zero',async()=>{
 mockRefresh.mockResolvedValue({isError:true});render(<Harness/>);fireEvent.press(screen.getByText('Save expense'));
 await waitFor(()=>expect(screen.getByText(/could not be checked/)).toBeTruthy());expect(mockProceed).not.toHaveBeenCalled();
});
