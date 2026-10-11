import { act,fireEvent, render, screen } from '@testing-library/react-native';
import {defaultProfile,usePreferencesStore} from '../../src/stores/usePreferencesStore';
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
afterEach(()=>act(()=>usePreferencesStore.getState().setProfile(null)));
test('all overview totals react to saved PHP without a dashboard refetch',()=>{
 act(()=>usePreferencesStore.getState().setProfile(defaultProfile('owner')));
 render(<OverviewScreen/>);
 const previousCalls=mockDashboard.refetch.mock.calls.length;
 act(()=>usePreferencesStore.getState().setProfile({...defaultProfile('owner'),'currency':'PHP'}));
 expect(screen.getByText('₱2,500.00')).toBeTruthy();expect(screen.getAllByText('₱1,380.00').length).toBeGreaterThan(0);expect(screen.getByText('₱1,120.00')).toBeTruthy();
 expect(screen.queryByText('$2,500.00')).toBeNull();expect(mockDashboard.refetch.mock.calls.length).toBe(previousCalls);
});
test('React Compiler cannot cache the old currency when only preferences change',()=>{
 const fs=require('node:fs'),path=require('node:path'),babel=require('@babel/core');
 const indexPath=path.resolve('app/(tabs)/index.tsx'),moneyPath=path.resolve('src/domain/money.ts');
 function compile(filename:string,overrides:Record<string,unknown>={}) {
  const code=babel.transformSync(fs.readFileSync(filename,'utf8'),{filename,configFile:false,babelrc:false,presets:['babel-preset-expo'],plugins:[['babel-plugin-react-compiler',{target:'19'}]]}).code;
  const loaded={exports:{} as any};
  // Execute the real compiler output while retaining Jest's isolated dependency mocks.
  const load=(name:string)=>{const resolved=name.startsWith('.')?path.resolve(path.dirname(filename),name):name;return overrides[resolved]??require(resolved);};
  Function('module','exports','require',code)(loaded,loaded.exports,load);return loaded.exports;
 }
 const money=compile(moneyPath),CompiledOverview=compile(indexPath,{[moneyPath.replace(/\.[^.]+$/,'')]:money}).default;
 act(()=>usePreferencesStore.getState().setProfile(defaultProfile('owner')));render(<CompiledOverview/>);
 expect(screen.getByText('$2,500.00')).toBeTruthy();
 act(()=>usePreferencesStore.getState().setProfile({...defaultProfile('owner'),currency:'PHP'}));
 expect(screen.getByText('₱2,500.00')).toBeTruthy();expect(screen.getByText('₱1,120.00')).toBeTruthy();expect(screen.queryByText('$2,500.00')).toBeNull();
});
test('keeps summaries and safe-to-spend while removing report sections',()=>{
 render(<OverviewScreen/>);
 expect(screen.getByText('$2,500.00')).toBeTruthy();expect(screen.getByText('Net cash flow')).toBeTruthy();expect(screen.getByText('Safe to spend')).toBeTruthy();
 expect(screen.queryByText('Spending pace')).toBeNull();expect(screen.queryByText('Expenses by Category')).toBeNull();expect(screen.queryByLabelText('View Groceries budget')).toBeNull();
 fireEvent.press(screen.getByText('View reports'));expect(mockPush).toHaveBeenCalledWith('/reports');
});
test('over-budget alerts open a fresh read-only category visit',()=>{
 render(<OverviewScreen/>);expect(screen.getByText('Rent is over budget')).toBeTruthy();expect(screen.queryByText('Groceries is over budget')).toBeNull();
 fireEvent.press(screen.getByLabelText('View Rent budget'));expect(mockPush).toHaveBeenCalledWith({pathname:'/budget/[categoryId]',params:{categoryId:'cat-2',visit:expect.any(String)}});
});
test('dismisses an over-budget alert without opening the category or changing totals',()=>{
 render(<OverviewScreen/>);
 fireEvent.press(screen.getByLabelText('Dismiss Rent is over budget'));
 expect(screen.queryByText('Rent is over budget')).toBeNull();
 expect(mockPush).not.toHaveBeenCalled();expect(screen.getByText('$2,500.00')).toBeTruthy();
});
test('an alert-query failure does not hide confirmed financial summaries',()=>{
 mockCategories.isError=true;render(<OverviewScreen/>);expect(screen.getByText('$2,500.00')).toBeTruthy();expect(screen.queryByText('Rent is over budget')).toBeNull();expect(screen.getByText('Try again')).toBeTruthy();
});
test('pending or failed dashboard data never appears as confirmed totals or alerts',()=>{
 mockDashboard.isPending=true;render(<OverviewScreen/>);expect(screen.queryByText('$2,500.00')).toBeNull();expect(screen.queryByText('Rent is over budget')).toBeNull();
});
test('groups multiple overages, then keeps individual navigation and dismissal',()=>{
 const previous=mockDashboard.data.categoryTotals;
 mockDashboard.data.categoryTotals=[{id:'cat-1',spent:30000},{id:'cat-2',spent:120000}];
 render(<OverviewScreen/>);
 expect(screen.getByText('2 categories over budget')).toBeTruthy();
 expect(screen.queryByText('Rent is over budget')).toBeNull();
 fireEvent.press(screen.getByLabelText('Over-budget categories'));
 expect(screen.getByText('Groceries is over budget')).toBeTruthy();
 fireEvent.press(screen.getByLabelText('Dismiss Groceries is over budget'));
 expect(screen.queryByText('Groceries is over budget')).toBeNull();
 expect(screen.getByText('Rent is over budget')).toBeTruthy();
 expect(screen.queryByText('2 categories over budget')).toBeNull();
 fireEvent.press(screen.getByLabelText('View Rent budget'));
 expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({categoryId:'cat-2'})}));
 mockDashboard.data.categoryTotals=previous;
});
