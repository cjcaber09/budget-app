import {render,screen,fireEvent,waitFor} from '@testing-library/react-native';
import {useExpenseBalanceReview} from '../../src/components/ExpenseBalanceReview';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {Pressable,Text} from 'react-native';
const mockProceed=jest.fn(),mockRefresh=jest.fn();
const mockRpc=jest.fn();
jest.mock('../../src/lib/supabase',()=>({supabase:{rpc:(...args:unknown[])=>({abortSignal:()=>mockRpc(...args)})}}));
jest.mock('../../src/domain/reports',()=>({decodeReportSnapshot:(data:unknown)=>data}));
const method={id:'cash',user_id:'owner',method:'cash',payment_type:'Cash',name:'Cash',baseline_at:'2026-10-01T00:00:00Z',balance:'20.00'};
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:[method],refetch:mockRefresh})}));
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodDialog:()=>null}));
function Harness({budget=false}:{budget?:boolean}){const review=useExpenseBalanceReview();return <><Pressable onPress={()=>void review.review({type:'expense',amount:50,paymentMethodId:null,...(budget?{categoryId:'food',transactionDate:'2026-11-03'}:{})},mockProceed)}><Text>Save expense</Text></Pressable><review.Controls/></>;}
beforeEach(()=>{mockProceed.mockClear();mockRefresh.mockResolvedValue({data:{owner:'owner',timezone:'UTC',methods:[method]},isError:false});usePreferencesStore.getState().setProfile({user_id:'owner',display_name:'',avatar_path:null,appearance:'system',currency:'USD',timezone:'UTC'});});
afterEach(()=>usePreferencesStore.getState().setProfile(null));
it('checks the entry month and asks before an over-budget expense even when funds are sufficient',async()=>{
 mockRefresh.mockResolvedValue({data:{owner:'owner',timezone:'UTC',methods:[{...method,balance:'100.00'}]}});
 mockRpc.mockResolvedValue({data:{categories:{data:[{id:'food',name:'Food',spent:8000,budget:10000}]}}});
 render(<Harness budget/>);fireEvent.press(screen.getByText('Save expense'));
 await screen.findByText(/\$30.00 over/);expect(mockProceed).not.toHaveBeenCalled();
 expect(mockRpc).toHaveBeenCalledWith('reporting_snapshot',{p_month:'2026-11-01'});
 expect(screen.queryByText('Correct balance')).toBeNull();fireEvent.press(screen.getByText('Record anyway'));expect(mockProceed).toHaveBeenCalledTimes(1);
});
it('asks for confirmation when no budget is set and can return without saving',async()=>{
 mockRpc.mockResolvedValue({data:{categories:{data:[{id:'food',name:'Food',spent:0,budget:null}]}}});
 render(<Harness budget/>);fireEvent.press(screen.getByText('Save expense'));await screen.findByText(/No budget is set/);
 fireEvent.press(screen.getByText('Back to expense'));expect(mockProceed).not.toHaveBeenCalled();
});
it('does not treat a failed budget check as an unset or zero budget',async()=>{
 mockRpc.mockResolvedValue({error:new Error('offline')});render(<Harness budget/>);fireEvent.press(screen.getByText('Save expense'));
 await screen.findByText(/category budget could not be checked/);expect(mockProceed).not.toHaveBeenCalled();
});
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
