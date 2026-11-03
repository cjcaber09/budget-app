import {expenseBudgetWarning} from '../../src/domain/expenseBudget';
import type {ReportCategory} from '../../src/domain/reports';
import type {Transaction} from '../../src/types/database';
const category:ReportCategory={id:'food',key:'food',name:'Food',color:'#555',spent:8000,budget:10000,count:2};
const input={type:'expense',amount:30,categoryId:'food',transactionDate:'2026-10-31'};
test('asks for confirmation above the cap, including already overspent categories',()=>{
 expect(expenseBudgetWarning(input,[category])).toContain('$10.00 over');
 expect(expenseBudgetWarning({...input,amount:1},[{...category,spent:11000}])).toContain('$11.00 over');
 expect(expenseBudgetWarning({...input,amount:20},[category])).toBeNull();
});
test('distinguishes unset and explicit zero budgets and ignores income',()=>{
 expect(expenseBudgetWarning(input,[{...category,budget:null}])).toContain('No budget is set');
 expect(expenseBudgetWarning(input,[{...category,spent:0,budget:0}])).toContain('$30.00 over');
 expect(expenseBudgetWarning({...input,type:'income'},[category])).toBeNull();
});
test('uses the expense month and avoids counting the edited expense twice',()=>{
 const previous={type:'expense',amount:30,category_id:'food',transaction_date:'2026-10-01',occurred_at:'2026-10-01T12:00:00Z'} as Transaction;
 expect(expenseBudgetWarning(input,[category],previous)).toBeNull();
 expect(expenseBudgetWarning({...input,transactionDate:'2026-11-01'},[category],previous)).toContain('$10.00 over');
 expect(expenseBudgetWarning(input,[category],{...previous,category_id:'other'})).toContain('$10.00 over');
 expect(expenseBudgetWarning(input,[{...category,spent:-1000}])).toBeNull();
});
