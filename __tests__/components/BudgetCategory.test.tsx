jest.mock('../../src/components/CategoryPerformance',()=>({CategoryPerformance:()=>null}));
import {fireEvent,render,screen} from '@testing-library/react-native';
import BudgetScreen from '../../app/(tabs)/budget/[categoryId]';
const mockMutate=jest.fn(),mockPush=jest.fn();
const category={id:'cat',name:'Groceries',color:'#55816A'};
const mockBudgets={data:[{category_id:'cat',amount:30}],isPending:false,isFetching:false,isError:false,refetch:jest.fn()};
const mockDashboard={data:{limitCents:10000,allocatedCents:9000},isFetching:false,isError:false,refetch:jest.fn()};
jest.mock('expo-router',()=>({useFocusEffect:()=>{},useLocalSearchParams:()=>({categoryId:'cat',visit:'test'}),useRouter:()=>({push:mockPush})}));
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>({data:[category],isFetching:false,isError:false,refetch:jest.fn()})}));
jest.mock('../../src/hooks/useBudgets',()=>({useBudgets:()=>mockBudgets,useSetBudget:()=>({mutate:mockMutate,reset:jest.fn(),isPending:false})}));
jest.mock('../../src/hooks/useDashboard',()=>({useDashboard:()=>mockDashboard}));
jest.mock('../../src/hooks/useTransactions',()=>({useTransactions:()=>({data:[{id:'own',category_id:'cat',amount:10,type:'expense',note:'Own groceries',occurred_at:'2026-10-08T00:00:00Z'},{id:'other',category_id:'other',amount:50,type:'expense',note:'Other category',occurred_at:'2026-10-08T00:00:00Z'}],isPending:false,isError:false,refetch:jest.fn()})}));
beforeEach(()=>jest.clearAllMocks());
test('category opens read-only and lists only its transactions',()=>{
 render(<BudgetScreen/>);expect(screen.queryByLabelText('Budget amount')).toBeNull();expect(screen.getByText('$30.00')).toBeTruthy();expect(screen.getByText('Own groceries')).toBeTruthy();expect(screen.queryByText('Other category')).toBeNull();
 fireEvent.press(screen.getByText('Own groceries'));expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({pathname:'/transaction/[id]',params:expect.objectContaining({id:'own',visit:expect.any(String)})}));
});
test('editing shows available allocation and rejects combined excess while retaining draft',()=>{
 render(<BudgetScreen/>);fireEvent.press(screen.getByLabelText('Edit category budget'));expect(screen.getByText('Available for this category: $40.00')).toBeTruthy();fireEvent.changeText(screen.getByLabelText('Budget amount'),'40.01');fireEvent.press(screen.getByText('Save Budget'));expect(mockMutate).not.toHaveBeenCalled();expect(screen.getByLabelText('Budget amount').props.value).toBe('40.01');fireEvent.changeText(screen.getByLabelText('Budget amount'),'40');fireEvent.press(screen.getByText('Save Budget'));expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({amount:40}),expect.anything());
});
