import {fireEvent,render,screen} from '@testing-library/react-native';
import {CategoryBudgetReport} from '../../src/components/CategoryBudgetReport';
import type {DashboardSnapshot} from '../../src/domain/spendingGuidance';
const mockPush=jest.fn();
jest.mock('expo-router',()=>({useRouter:()=>({push:mockPush})}));
const names=['Under','Near','Reached','Over','Zero','Unset','Extra'];
const categories=names.map(name=>({id:name,user_id:'owner',name,color:'#55816A',icon:'cart',is_default:false}));
const budgets=names.slice(0,4).map(name=>({id:name,user_id:'owner',category_id:name,month:'2026-10-01',amount:100}));
const snapshot:DashboardSnapshot={month:'2026-10-01',today:'2026-10-09',timezone:'UTC',complete:true,preview:false,limitCents:50000,allocatedCents:40000,incomeCents:0,expenseCents:38000,spentToDateCents:38000,futureRecordedCents:0,discretionaryToDateCents:0,futureDiscretionaryCents:0,reservedCents:0,legacyDuplicates:0,bills:[],categoryTotals:names.map((id,i)=>({id,name:id,color:'#55816A',spent:[5000,8000,10000,12500,0,2500,0][i]}))};
test('shows all categories including zero/unset and exposes over-budget amount beyond a full ring',()=>{
 render(<CategoryBudgetReport categories={categories} budgets={budgets} snapshot={snapshot}/>);
 for(const name of names)expect(screen.getByLabelText(`View ${name} budget`)).toBeTruthy();
 expect(screen.getByText('50%',{includeHiddenElements:true})).toBeTruthy();expect(screen.getByText('80%',{includeHiddenElements:true})).toBeTruthy();expect(screen.getByText('100%',{includeHiddenElements:true})).toBeTruthy();expect(screen.getByText('125%',{includeHiddenElements:true})).toBeTruthy();
 expect(screen.getByText('Over by $25.00')).toBeTruthy();expect(screen.getByText('Budget reached')).toBeTruthy();expect(screen.getAllByText('No budget')).toHaveLength(3);
 expect(screen.queryByText('Infinity%')).toBeNull();
});
test('category doughnuts retain fresh read-only detail navigation on every press',()=>{
 render(<CategoryBudgetReport categories={categories} budgets={budgets} snapshot={snapshot}/>);
 fireEvent.press(screen.getByLabelText('View Over budget'));fireEvent.press(screen.getByLabelText('View Over budget'));
 const first=mockPush.mock.calls[0][0],second=mockPush.mock.calls[1][0];
 expect(first).toMatchObject({pathname:'/budget/[categoryId]',params:{categoryId:'Over',visit:expect.any(String)}});
 expect(first.params.visit).not.toBe(second.params.visit);
});

test.each([[9960,'99.6%','Nearing limit'],[10001,'100.1%','Over budget']])('rounded usage preserves the reached threshold for %s cents',(spent,usage,state)=>{
 render(<CategoryBudgetReport categories={categories.slice(0,1)} budgets={budgets.slice(0,1)} snapshot={{...snapshot,categoryTotals:[{id:'Under',name:'Under',color:'#55816A',spent:Number(spent)}]}}/>);
 expect(screen.getByText(String(usage),{includeHiddenElements:true})).toBeTruthy();expect(screen.getByText(String(state))).toBeTruthy();expect(screen.queryByText('Budget reached')).toBeNull();
});
