import {analysisCsv,transactionCsv,decimalCents,csvCell,matchesTransactionSearch} from '../../src/domain/csv';
const context={owner:'owner',start:'2026-10-01',end:'2026-10-01',timezone:'Asia/Manila',currency:'PHP'};
const envelope=(rows:any[])=>({...context,generated_at:'2026-10-10T00:00:00Z',rows});
const monthly={row_type:'monthly',month:context.start,income:'20000',spending:'10101',net_income:'9899',expense_count:2};
const category={row_type:'category',month:context.start,identifier:'cat',name:'Groceries, "weekly"',spending:'10101',expense_count:2};
const account={row_type:'account',month:context.start,identifier:'bank',name:'=HYPERLINK("bad")',payment_type:'Bank account',last_four:null,archived:false,spending:'10101',expense_count:2};
test('exact signed cents and safe-integer boundary never pass through decimal floating arithmetic',()=>{
 expect(decimalCents('9007199254740991')).toBe('90071992547409.91');expect(decimalCents('-1')).toBe('-0.01');expect(()=>decimalCents('9007199254740992')).toThrow();
});
test('escapes quotes, commas, newlines and guards formulas even after whitespace',()=>{
 expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');expect(csvCell(' \t=1+1')).toBe('"\' \t=1+1"');expect(csvCell('-0.01',false)).toBe('"-0.01"');
});
test('analysis reconciles amounts and counts and emits protected spreadsheet text',()=>{
 const csv=analysisCsv(envelope([monthly,category,account]),context);expect(csv.startsWith('\ufeff')).toBe(true);expect(csv).toContain('"101.01"');expect(csv).toContain('"100.00"');expect(csv).toContain("\"'=HYPERLINK");expect(csv).toContain('Groceries, ""weekly""');
});
test('rejects incomplete months, foreign contexts and mismatched breakdown counts/amounts',()=>{
 expect(()=>analysisCsv(envelope([monthly,category]),context)).toThrow('reconcile');
 expect(()=>analysisCsv(envelope([monthly,{...category,expense_count:1},account]),context)).toThrow('reconcile');
 expect(()=>analysisCsv({...envelope([monthly,category,account]),owner:'foreign'},context)).toThrow('changed');
 expect(()=>analysisCsv(envelope([monthly,category,account]),{...context,start:'2025-11-01'})).toThrow();
});
test('zero month emits blank percentages and all breakdowns',()=>{
 expect(analysisCsv(envelope([{...monthly,income:'0',spending:'0',net_income:'0',expense_count:0},{...category,spending:'0',expense_count:0},{...account,spending:'0',expense_count:0}]),context)).not.toContain('NaN');
});
const tx={transaction_id:'tx',financial_date:'2026-10-02',type:'expense',amount:'10101',category:'Groceries',payment_account_id:'cash',payment_account:'Cash',payment_type:'Cash',last_four:null,income_source:'',note:'weekly shop',spending_source:'manual'};
test('transaction export uses complete rows and the shared search/type filter',()=>{
 const rows=Array.from({length:1001},(_,i)=>({...tx,transaction_id:String(i)}));
 expect(transactionCsv(envelope(rows),context,'expense','groceries').count).toBe(1001);
 expect(transactionCsv(envelope(rows),context,'income','').count).toBe(0);
 expect(transactionCsv(envelope(rows),context,'all','101.01').count).toBe(1001);
 expect(matchesTransactionSearch({type:'expense',amount:101.01,note:'weekly shop'},'Groceries','expense','weekly')).toBe(true);
 expect(()=>transactionCsv(envelope([tx,tx]),context,'all','')).toThrow('Duplicate');
});
