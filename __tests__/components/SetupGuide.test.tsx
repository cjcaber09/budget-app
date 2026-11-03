import {useFinancialResetStore} from '../../src/stores/useFinancialResetStore';
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {SetupGuide} from '../../src/components/SetupGuide';
import {openSetupGuide,useSetupGuideStore} from '../../src/stores/useSetupGuideStore';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
const owner='00000000-0000-4000-8000-000000000001';
const mockUpdate=jest.fn(),mockCashSave=jest.fn(),mockLimitSave=jest.fn(),mockCategorySave=jest.fn(),mockMethodRefresh=jest.fn(),mockDashboardRefresh=jest.fn();
let mockCash:any,mockDashboard:any;
jest.mock('expo-router',()=>({useRouter:()=>({push:jest.fn()})}));
jest.mock('../../src/hooks/useProfile',()=>({useProfile:()=>({isSuccess:true}),useUpdateProfile:()=>({mutateAsync:mockUpdate})}));
jest.mock('../../src/hooks/usePaymentMethods',()=>({usePaymentMethods:()=>({methods:[mockCash],isSuccess:true,refetch:mockMethodRefresh})}));
jest.mock('../../src/hooks/useInitializeCash',()=>({useInitializeCash:()=>({mutateAsync:mockCashSave})}));
jest.mock('../../src/hooks/useDashboard',()=>({useDashboard:()=>({data:mockDashboard,isSuccess:true,refetch:mockDashboardRefresh}),useSetMonthlyLimit:()=>({mutateAsync:mockLimitSave})}));
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>({data:[],isSuccess:true})}));
jest.mock('../../src/hooks/useBudgets',()=>({useBudgets:()=>({data:[],isSuccess:true,refetch:jest.fn()}),useSetBudget:()=>({mutateAsync:mockCategorySave})}));
beforeEach(async()=>{
 useFinancialResetStore.setState({pending:null,starting:false});
 await AsyncStorage.clear();jest.clearAllMocks();usePreferencesStore.getState().setProfile({...defaultProfile(owner),timezone:'UTC'});
 useSetupGuideStore.setState({owner,visible:false,loaded:true,step:0,completed:false});
 mockCash={id:'cash',user_id:owner,method:'cash',archived:false,opening_balance:'100.00'};
 mockDashboard={limitCents:10000,allocatedCents:0};
 mockUpdate.mockImplementation(async patch=>{usePreferencesStore.getState().setProfile({...usePreferencesStore.getState().profile!,...patch});});
 mockMethodRefresh.mockResolvedValue({data:{owner,methods:[mockCash]},isError:false});mockDashboardRefresh.mockResolvedValue({data:mockDashboard,isError:false});mockCashSave.mockResolvedValue({state:'initialized'});mockLimitSave.mockResolvedValue(undefined);
});
async function mount(){openSetupGuide(owner);render(<SetupGuide/>);await screen.findByText('Currency & timezone');}
test('opening setup never changes finances and changing currency requires confirmation',async()=>{
 await mount();expect(mockUpdate).not.toHaveBeenCalled();expect(mockCashSave).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('PHP'));fireEvent.press(screen.getByText('Continue'));
 await screen.findByText('Confirm currency & continue');expect(mockUpdate).not.toHaveBeenCalled();
 fireEvent.press(screen.getByText('Confirm currency & continue'));await screen.findByText('Starting balances');expect(mockUpdate).toHaveBeenCalledWith({currency:'PHP',timezone:'UTC'});
 fireEvent.press(screen.getByText('Continue'));await screen.findByText('Monthly budget');expect(mockCashSave).not.toHaveBeenCalled();
});
test('uncertain Cash setup refreshes before proceeding without a second write',async()=>{
 mockCash={...mockCash,opening_balance:null};mockCashSave.mockRejectedValueOnce(new Error('Lost response'));
 await mount();fireEvent.press(screen.getByText('Continue'));await screen.findByLabelText('Setup starting Cash balance');
 fireEvent.changeText(screen.getByLabelText('Setup starting Cash balance'),'25');fireEvent.press(screen.getByText('Continue'));
 await screen.findByText('Refresh saved values');fireEvent.press(screen.getByText('Refresh saved values'));await screen.findByText('Monthly budget');expect(mockCashSave).toHaveBeenCalledTimes(1);
});
test('confirmed monthly saves retry reads rather than issuing another write',async()=>{
 await mount();fireEvent.press(screen.getByText('Continue'));await screen.findByText('Starting balances');fireEvent.press(screen.getByText('Continue'));await screen.findByText('Monthly budget');
 mockDashboardRefresh.mockResolvedValueOnce({isError:true});fireEvent.changeText(screen.getByLabelText('Setup monthly budget'),'200');fireEvent.press(screen.getByText('Continue'));
 await screen.findByText('Refresh saved values');fireEvent.press(screen.getByText('Refresh saved values'));await screen.findByText('Category allocations');expect(mockLimitSave).toHaveBeenCalledTimes(1);
});
test('continue later preserves the step and unsaved input in the running session',async()=>{
 await mount();fireEvent.press(screen.getByText('Continue'));await screen.findByText('Starting balances');fireEvent.press(screen.getByText('Continue'));await screen.findByText('Monthly budget');
 fireEvent.changeText(screen.getByLabelText('Setup monthly budget'),'123.45');fireEvent.press(screen.getByText('Continue later'));
 await act(async()=>{openSetupGuide(owner);});await waitFor(()=>expect(screen.getByLabelText('Setup monthly budget').props.value).toBe('123.45'));expect(mockLimitSave).not.toHaveBeenCalled();
});

test('closes setup when record cleanup begins without making a financial change',async()=>{
 await mount();act(()=>useFinancialResetStore.setState({pending:{owner,requestId:'reset',accepted:true}}));
 expect(screen.queryByText('Currency & timezone')).toBeNull();expect(useSetupGuideStore.getState().visible).toBe(false);expect(mockCashSave).not.toHaveBeenCalled();
});
