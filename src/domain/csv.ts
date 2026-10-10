import { reportCents } from './reports';

export type TransactionFilter = 'all' | 'expense' | 'income';
export function matchesTransactionSearch(row: {type:string; amount:string|number; note:string|null}, category:string, filter:TransactionFilter, search:string) {
  return (filter === 'all' || row.type === filter) && `${category} ${row.note ?? ''} ${row.type} ${row.amount}`.toLowerCase().includes(search.toLowerCase().trim());
}
export function decimalCents(value:unknown) {
  const cents=BigInt(reportCents(value)), absolute=cents<0n?-cents:cents;
  return `${cents<0n?'-':''}${absolute/100n}.${String(absolute%100n).padStart(2,'0')}`;
}
export function csvCell(value:unknown, text=true) {
  let cell=value==null?'':String(value);
  // A quoted CSV field alone does not prevent spreadsheet formulas.
  if(text && /^[\s\u0000-\u001f]*[=+\-@]/.test(cell))cell="'"+cell;
  return '"'+cell.replace(/"/g,'""')+'"';
}
export function csvFile(headers:string[], rows:unknown[][], numericColumns:number[]=[]) {
  return '\ufeff'+[headers.map(v=>csvCell(v)).join(','),...rows.map(row=>row.map((v,i)=>csvCell(v,!numericColumns.includes(i))).join(','))].join('\r\n')+'\r\n';
}
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Export data could not be read. Please retry.');return v as Record<string,unknown>;};
export interface ExportContext {owner:string;start:string;end:string;timezone:string;currency:string}
export function exportEnvelope(raw:unknown, expected:ExportContext) {
  const envelope=obj(raw);
  for(const key of Object.keys(expected) as (keyof ExportContext)[])if(envelope[key]!==expected[key])throw new Error('Export settings changed. Please retry.');
  if(typeof envelope.generated_at!=='string'||!Number.isFinite(Date.parse(envelope.generated_at))||!Array.isArray(envelope.rows))throw new Error('Export data is incomplete. Please retry.');
  return {generatedAt:envelope.generated_at,rows:envelope.rows.map(obj)};
}
const str=(v:unknown)=>{if(typeof v!=='string')throw new Error('Export text is incomplete. Please retry.');return v;};
const count=(v:unknown)=>{if(!Number.isSafeInteger(v)||Number(v)<0)throw new Error('Export count is invalid. Please retry.');return Number(v);};
export function analysisCsv(raw:unknown, context:ExportContext) {
  const {rows,generatedAt}=exportEnvelope(raw,context);
  const headers=['row_type','month','currency','financial_timezone','exported_at','identifier','name','payment_type','last_four','archived','income','spending','net_income','expense_count','spending_percent'];
  const groups=new Map<string,{total:bigint;count:number;category:bigint;account:bigint;categoryCount:number;accountCount:number}>();
  for(const row of rows){
    const month=str(row.month);if(month<context.start||month>context.end||!/^\d{4}-\d{2}-01$/.test(month))throw new Error('Export month is invalid.');
    if(row.row_type==='monthly'){
      if(groups.has(month))throw new Error('Duplicate export month.');
      const total=BigInt(reportCents(row.spending)),income=BigInt(reportCents(row.income)),net=BigInt(reportCents(row.net_income));
      if(total<0n||income<0n||income-total!==net)throw new Error('Export totals do not reconcile.');
      groups.set(month,{total,count:count(row.expense_count),category:0n,account:0n,categoryCount:0,accountCount:0});
    }
  }
  const output=rows.map(row=>{
    const month=str(row.month),group=groups.get(month);if(!group)throw new Error('Export monthly totals are missing.');
    const monthly=row.row_type==='monthly',kind=row.row_type;
    if(kind!=='monthly'&&kind!=='category'&&kind!=='account')throw new Error('Unknown export row.');
    const amount=reportCents(row.spending),n=count(row.expense_count);if(amount<0)throw new Error('Export spending is invalid.');
    if(kind==='category'||kind==='account'){group[kind]+=BigInt(amount);group[kind==='category'?'categoryCount':'accountCount']+=n;str(row.identifier);str(row.name);}
    if(kind==='account'&&(typeof row.archived!=='boolean'||typeof row.payment_type!=='string'||(row.last_four!==null&&!/^\d{4}$/.test(String(row.last_four)))))throw new Error('Export account is invalid.');
    return [kind,month.slice(0,7),context.currency,context.timezone,generatedAt,row.identifier??'',row.name??'',row.payment_type??'',row.last_four??'',row.archived??'',monthly?decimalCents(row.income):'',decimalCents(row.spending),monthly?decimalCents(row.net_income):'',n,monthly?'':group.total===0n?'':(amount/Number(group.total)*100).toFixed(2)];
  });
  const expectedMonths=(Number(context.end.slice(0,4))-Number(context.start.slice(0,4)))*12+Number(context.end.slice(5,7))-Number(context.start.slice(5,7))+1;
  if(groups.size!==expectedMonths)throw new Error('Export months are missing.');
  for(const group of groups.values())if(group.category!==group.total||group.account!==group.total||group.categoryCount!==group.count||group.accountCount!==group.count)throw new Error('Export breakdowns do not reconcile.');
  return csvFile(headers,output,[10,11,12,13,14]);
}
export function transactionCsv(raw:unknown, context:ExportContext, filter:TransactionFilter, search:string) {
  const {rows}=exportEnvelope(raw,context);
  const seen=new Set<string>();
  const filtered=rows.filter(row=>{
    const id=str(row.transaction_id);if(seen.has(id))throw new Error('Duplicate transaction in export.');seen.add(id);
    const date=str(row.financial_date);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date.slice(0,7)!==context.start.slice(0,7))throw new Error('Transaction date changed.');
    if(row.type!=='expense'&&row.type!=='income'||reportCents(row.amount)<=0)throw new Error('Invalid transaction in export.');
    for(const key of ['category','payment_account','payment_type','income_source'])str(row[key]);
    if(row.note!==null)str(row.note);
    return matchesTransactionSearch({type:row.type,amount:Number(decimalCents(row.amount)),note:row.note as string|null},row.search_category===undefined?row.category as string:str(row.search_category),filter,search);
  });
  const headers=['transaction_id','financial_date','type','amount','currency','category','payment_account_id','payment_account','payment_type','last_four','income_source','note','spending_source'];
  return {count:filtered.length,csv:csvFile(headers,filtered.map(row=>[row.transaction_id,row.financial_date,row.type,decimalCents(row.amount),context.currency,row.category,row.payment_account_id,row.payment_account,row.payment_type,row.last_four,row.income_source,row.note,row.spending_source]),[3])};
}
