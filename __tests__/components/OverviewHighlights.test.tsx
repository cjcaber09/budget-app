import {act,fireEvent,render,screen} from '@testing-library/react-native';
import {OverviewHighlights} from '../../src/components/OverviewHighlights';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
const mockPush=jest.fn(),mockRefetch=jest.fn();let mockQuery:any;
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
jest.mock('../../src/hooks/useOverviewHighlights',()=>({useOverviewHighlights:()=>mockQuery}));
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:[]})}));
jest.mock('../../src/components/PaymentMethodPicker',()=>({PaymentMethodDialog:()=>null}));
beforeEach(()=>{jest.clearAllMocks();mockQuery={supported:true,today:'2026-10-16',isError:false,refetch:mockRefetch,data:{recent:{data:[{id:'refund',user_id:'owner',type:'refund',amount:15,refund_of:'parent',financial_date:'2026-10-16',category:'Groceries',payment_account:'Cash',payment_type:'Cash',note:'Returned item'}]},categories:{data:[{id:null,key:'uncategorized',name:'Uncategorized',color:'#69736A',spent:500}]},methods:{data:[{id:'bank',key:'bank',name:'Bank',paymentType:'Debit card',lastFour:'1234',archived:true,count:3,spent:400}]}}};});
afterEach(()=>act(()=>usePreferencesStore.getState().setProfile(null)));
test('tabs expose only the active list and refund navigation targets the parent',()=>{
 render(<OverviewHighlights month="2026-10-01"/>);expect(screen.getByText('Returned item')).toBeTruthy();expect(screen.queryByText('Bank · Archived')).toBeNull();
 fireEvent.press(screen.getByLabelText(/Refund · Groceries/));expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({pathname:'/transaction/[id]',params:expect.objectContaining({id:'parent',refundId:'refund',visit:expect.any(String)})}));
 fireEvent.press(screen.getByRole('tab',{name:'Categories'}));expect(screen.queryByText('Returned item')).toBeNull();
 expect(screen.getByRole('tab',{name:'Categories'}).props.accessibilityState.selected).toBe(true);
 fireEvent.press(screen.getByLabelText(/Uncategorized, net spending/));expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({params:expect.objectContaining({kind:'cashflow',month:'2026-10-01',filter:'uncategorized'})}));
 fireEvent.press(screen.getByRole('tab',{name:'Methods'}));expect(screen.getByText('3 payments')).toBeTruthy();expect(screen.getByText('Bank · Archived')).toBeTruthy();
 fireEvent.press(screen.getByText('View account spending'));expect(mockPush).toHaveBeenLastCalledWith(expect.objectContaining({params:expect.objectContaining({kind:'accounts',month:'2026-10-01'})}));
});
test('month changes retain the tab while account changes reset it',()=>{
 act(()=>usePreferencesStore.getState().setProfile(defaultProfile('one')));const view=render(<OverviewHighlights month="2026-10-01"/>);
 fireEvent.press(screen.getByRole('tab',{name:'Methods'}));view.rerender(<OverviewHighlights month="2026-09-01"/>);expect(screen.getByRole('tab',{name:'Methods'}).props.accessibilityState.selected).toBe(true);
 act(()=>usePreferencesStore.getState().setProfile(defaultProfile('two')));expect(screen.getByRole('tab',{name:'Recent'}).props.accessibilityState.selected).toBe(true);
});
test('section errors offer retry and empty lists never invent zero rows',()=>{
 mockQuery.data.recent={error:'Could not load this list. Retry.'};render(<OverviewHighlights month="2026-10-01"/>);fireEvent.press(screen.getByText('Retry this list'));expect(mockRefetch).toHaveBeenCalled();
 mockQuery.data.categories={data:[]};fireEvent.press(screen.getByRole('tab',{name:'Categories'}));expect(screen.getByText('No positive category spending this month.')).toBeTruthy();
});
