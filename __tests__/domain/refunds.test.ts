import {refundCents} from '../../src/domain/refunds';
import {decodeReportSnapshot} from '../../src/domain/reports';
import {rawReport,context} from '../../test-utils/report';
import {sumTransactionsByType,sumTransactionsForCategory} from '../../src/domain/budgetMath';
import {matchesTransactionSearch} from '../../src/domain/csv';
test('refund input preserves cents and rejects zero/negative/overflow/excess precision',()=>{
 expect(refundCents('25.50')).toBe(2550);expect(refundCents('1000')).toBe(100000);
 for(const value of ['','0','-1','NaN','1.001','10000000000'])expect(refundCents(value)).toBeNull();
});
test('versioned reports admit refunds above current spending without treating them as income',()=>{
 const raw=rawReport();raw.refundVersion=1;raw.totals={income:'0',expense:'-2550',net:'2550'};raw.categories[0].spent='-2550';raw.accounts[0].amount='-2550';raw.daily[0].amount='-2550';raw.weekly[0].amount='-2550';raw.monthly[0].amount='-2550';raw.categoryMonthly[0].amount='-2550';raw.comparison=null;
 const report=decodeReportSnapshot(raw,context);expect(report.totals.data).toEqual({income:0,expense:-2550,net:2550});expect(report.categories.data?.[0].spent).toBe(-2550);expect(report.accounts.data?.[0].amount).toBe(-2550);expect(report.daily.data?.[0].amount).toBe(-2550);
 delete raw.refundVersion;expect(decodeReportSnapshot(raw,context).totals.error).toBeDefined();
});
test('expense filters and category totals subtract refunds, while income excludes them',()=>{
 const rows:any=[{category_id:'cat',type:'expense',amount:100},{category_id:'cat',type:'refund',amount:25},{category_id:null,type:'income',amount:10}];
 expect(sumTransactionsForCategory(rows,'cat')).toBe(75);expect(sumTransactionsByType(rows,'expense')).toBe(75);expect(sumTransactionsByType(rows,'income')).toBe(10);
 expect(matchesTransactionSearch({type:'refund',amount:25,note:null},'Groceries','expense','')).toBe(true);expect(matchesTransactionSearch({type:'refund',amount:25,note:null},'Groceries','income','')).toBe(false);
 expect(sumTransactionsForCategory([{category_id:'cat',type:'expense',amount:0.1},{category_id:'cat',type:'expense',amount:0.2},{category_id:'cat',type:'refund',amount:0.1}] as any,'cat')).toBe(0.2);
});
