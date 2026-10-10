import { addMonths, format, parseISO } from 'date-fns';
import { isCalendarDate, isUuid } from '../../supabase/functions/ocr/shared';

export interface ReportTotals { income:number; expense:number; net:number; count?:number }
export interface ReportCategory { key:string; id:string|null; name:string; color:string; budget:number|null; spent:number; count:number }
export interface ReportGroup { key:string; id:string|null; name:string; archived:boolean; amount:number; count:number; paymentType?:string; lastFour?:string|null }
export interface ReportPoint { day:string; amount:number; future:boolean; key?:string; end?:string }
export interface ReportComparison { start:string; end:string; previousStart:string; previousEnd:string; current:ReportTotals; previous:ReportTotals; delta:ReportTotals; categories:{key:string;name:string;current:number;previous:number;delta:number}[] }
export type ReportSection<T> = {data:T;error?:never}|{data?:never;error:string};
export interface ReportSnapshot {
 owner:string; month:string; timezone:string; today:string;
 totals:ReportSection<ReportTotals>; categories:ReportSection<ReportCategory[]>; sources:ReportSection<ReportGroup[]>; accounts:ReportSection<ReportGroup[]>;
 daily:ReportSection<ReportPoint[]>; weekly:ReportSection<ReportPoint[]>; monthly:ReportSection<ReportPoint[]>; categoryMonthly:ReportSection<ReportPoint[]>; comparison:ReportSection<ReportComparison|null>;
}
type ObjectValue=Record<string,unknown>;
const object=(v:unknown):ObjectValue=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Report data could not be read. Retry to refresh.');return v as ObjectValue;};
const string=(v:unknown)=>{if(typeof v!=='string')throw new Error('Report text could not be read.');return v;};
const day=(v:unknown)=>{const s=string(v);if(!isCalendarDate(s))throw new Error('Report period could not be read.');return s;};
const count=(v:unknown)=>{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new Error('Report count could not be read.');return v;};
const boolean=(v:unknown)=>{if(typeof v!=='boolean')throw new Error('Report state could not be read.');return v;};
const rows=(v:unknown):ObjectValue[]=>{if(!Array.isArray(v))throw new Error('Report rows could not be read.');return v.map(object);};
const identifier=(v:unknown)=>{if(v===null)return null;const s=string(v);if(!isUuid(s))throw new Error('Report identifier could not be read.');return s;};
const nonnegative=(v:unknown)=>{const n=reportCents(v);if(n<0)throw new Error('Report amount could not be read.');return n;};
export function reportCents(v:unknown):number {
 if(typeof v!=='string'||! /^-?(0|[1-9]\d*)$/.test(v))throw new Error('Report money could not be read. Retry to refresh.');
 const n=BigInt(v);if(n>BigInt(Number.MAX_SAFE_INTEGER)||n<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('This report amount exceeds the supported range.');
 return Number(n);
}
export function checkedReportDifference(a:number,b:number) { const n=a-b;if(!Number.isSafeInteger(n))throw new Error('This report difference exceeds the supported range.');return n; }
export function reportPercentage(current:number,previous:number):number|null {return previous<=0?null:(checkedReportDifference(current,previous)/previous)*100;}
export function reportShare(amount:number,total:number):number|null {return total>0?amount/total*100:null;}
export function reportingMonthSupported(month:string,today:string) {
 return isCalendarDate(month)&&month.endsWith('-01')&&month>='0001-12-01'&&month<=format(addMonths(parseISO(today.slice(0,7)+'-01'),24),'yyyy-MM-01');
}
function section<T>(read:()=>T):ReportSection<T>{try{return {data:read()};}catch(e){return {error:e instanceof Error?e.message:'Report data could not be read.'};}}
const totals=(v:unknown,signed=false):ReportTotals=>{const r=object(v),income=signed?reportCents(r.income):nonnegative(r.income),expense=signed?reportCents(r.expense):nonnegative(r.expense),net=reportCents(r.net);if(checkedReportDifference(income,expense)!==net)throw new Error('Report totals do not reconcile. Retry to refresh.');return {income,expense,net,...(r.count===undefined?{}:{count:count(r.count)})};};
const points=(v:unknown)=>rows(v).map(r=>({day:day(r.day),amount:nonnegative(r.amount),future:r.future===undefined?false:boolean(r.future),...(r.key===undefined?{}:{key:string(r.key)}),...(r.end===undefined?{}:{end:day(r.end)})}));
const group=(v:unknown)=>rows(v).map(r=>({key:string(r.key),id:identifier(r.id),name:string(r.name),archived:boolean(r.archived),amount:nonnegative(r.amount),count:count(r.count),...(r.paymentType===undefined?{}:{paymentType:string(r.paymentType)}),...(r.lastFour===undefined?{}:{lastFour:r.lastFour===null?null:string(r.lastFour)})}));
function comparison(v:unknown):ReportComparison|null {
 if(v===null)return null;
 const c=object(v),current=totals(c.current),previous=totals(c.previous),delta=totals(c.delta,true);
 for(const key of ['income','expense','net'] as const){if(checkedReportDifference(current[key],previous[key])!==delta[key])throw new Error('Comparison amounts do not reconcile. Retry to refresh.');}
 const categories=rows(c.categories).map(r=>{const current=nonnegative(r.current),previous=nonnegative(r.previous),delta=reportCents(r.delta);if(checkedReportDifference(current,previous)!==delta)throw new Error('Category comparison does not reconcile.');return {key:string(r.key),name:string(r.name),current,previous,delta};});
 const start=day(c.start),end=day(c.end),previousStart=day(c.previousStart),previousEnd=day(c.previousEnd);
 if(start>=end||previousStart>=previousEnd||previousEnd>start)throw new Error('Comparison periods could not be read.');
 return {start,end,previousStart,previousEnd,current,previous,delta,categories};
}
export function decodeReportSnapshot(raw:unknown,context:{owner:string;month:string;timezone:string;today:string}):ReportSnapshot {
 const r=object(raw);
 if(r.owner!==context.owner||r.month!==context.month||r.start!==context.month||r.timezone!==context.timezone||r.today!==context.today||r.end!==format(addMonths(parseISO(context.month),1),'yyyy-MM-dd'))throw new Error('The report context changed. Retry to refresh your financial month.');
 return {owner:context.owner,month:context.month,timezone:context.timezone,today:context.today,
  totals:section(()=>totals(r.totals)),
  categories:section(()=>rows(r.categories).map(c=>({key:string(c.key),id:identifier(c.id),name:string(c.name),color:string(c.color),budget:c.budget===null?null:nonnegative(c.budget),spent:nonnegative(c.spent),count:count(c.count)}))),
  sources:section(()=>group(r.sources)),accounts:section(()=>group(r.accounts)),
  daily:section(()=>points(r.daily)),weekly:section(()=>points(r.weekly)),monthly:section(()=>points(r.monthly)),categoryMonthly:section(()=>points(r.categoryMonthly)),
  comparison:section(()=>comparison(r.comparison)),
 };
}
