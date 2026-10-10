import { fireEvent, render, screen } from '@testing-library/react-native';
import OverviewScreen from '../../app/(tabs)/index';
const mockPush = jest.fn();
const mockDashboard = { data: { complete: true, today: '2026-07-10', month: '2026-07-01', limitCents: 200000, allocatedCents: 120000, incomeCents: 250000, expenseCents: 138000, spentToDateCents: 138000, futureRecordedCents: 0, discretionaryToDateCents: 10000, futureDiscretionaryCents: 0, reservedCents: 0, bills: [], legacyDuplicates: 0, categoryTotals: [{ id: 'cat-1', spent: 18000 }, { id: 'cat-2', spent: 120000 }] }, isPending: false, isError: false, refetch: jest.fn() };
const mockCategories = { data: [{id:'cat-1',name:'Groceries',color:'#55816A'},{id:'cat-2',name:'Rent',color:'#61889A'}], isPending:false,isError:false,refetch:jest.fn() };
jest.mock('../../src/hooks/useCategories',()=>({useCategories:()=>mockCategories}));
jest.mock('../../src/hooks/useBudgets',()=>({useBudgets:()=>({data:[{category_id:'cat-1',amount:200},{category_id:'cat-2',amount:1000}],isPending:false,isError:false,refetch:jest.fn()})}));
jest.mock('../../src/hooks/useDashboard',()=>({useDashboard:()=>mockDashboard,useSetMonthlyLimit:()=>({mutate:jest.fn()})}));
jest.mock('../../src/stores/useUiStore',()=>({useUiStore:(s:any)=>s({selectedMonth:'2026-07-01'})}));
jest.mock('../../src/components/UpcomingBillsBell',()=>({UpcomingBillsBell:()=>null}));
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
beforeEach(()=>{mockPush.mockClear();mockCategories.isError=false;mockDashboard.isPending=false;mockDashboard.isError=false;});
test('keeps summaries and safe-to-spend while removing report sections',()=>{
 render(<OverviewScreen/>);
 expect(screen.getByText('$2,500.00')).toBeTruthy();expect(screen.getByText('Net income')).toBeTruthy();expect(screen.getByText('Safe to spend')).toBeTruthy();
 expect(screen.queryByText('Daily Spending Pace')).toBeNull();expect(screen.queryByText('Expenses by Category')).toBeNull();expect(screen.queryByLabelText('View Groceries budget')).toBeNull();
 fireEvent.press(screen.getByText('View reports'));expect(mockPush).toHaveBeenCalledWith('/reports');
});
test('over-budget alerts open a fresh read-only category visit',()=>{
 render(<OverviewScreen/>);expect(screen.getByText('Rent is over budget')).toBeTruthy();expect(screen.queryByText('Groceries is over budget')).toBeNull();
 fireEvent.press(screen.getByLabelText('View Rent budget'));expect(mockPush).toHaveBeenCalledWith({pathname:'/budget/[categoryId]',params:{categoryId:'cat-2',visit:expect.any(String)}});
});
test('an alert-query failure does not hide confirmed financial summaries',()=>{
 mockCategories.isError=true;render(<OverviewScreen/>);expect(screen.getByText('$2,500.00')).toBeTruthy();expect(screen.queryByText('Rent is over budget')).toBeNull();expect(screen.getByText('Try again')).toBeTruthy();
});
test('pending or failed dashboard data never appears as confirmed totals or alerts',()=>{
 mockDashboard.isPending=true;render(<OverviewScreen/>);expect(screen.queryByText('$2,500.00')).toBeNull();expect(screen.queryByText('Rent is over budget')).toBeNull();
});
