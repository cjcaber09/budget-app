import {decodeActivityPage,type HistoryActivity} from './activityPages';
import {reportCents,type ReportSection} from './reports';
import {isUuid} from '../../supabase/functions/ocr/shared';
export interface HighlightCategory {id:string|null;key:string;name:string;color:string;spent:number}
export interface HighlightMethod {id:string;key:string;name:string;paymentType:string;lastFour:string|null;archived:boolean;count:number;spent:number}
export interface OverviewHighlights {recent:ReportSection<HistoryActivity[]>;categories:ReportSection<HighlightCategory[]>;methods:ReportSection<HighlightMethod[]>}
export interface HighlightContext {owner:string;month:string;timezone:string;today:string}
function object(raw:unknown):Record<string,unknown>{if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Highlights could not be read. Retry.');return raw as Record<string,unknown>;}
function string(raw:unknown){if(typeof raw!=='string'||!raw.trim())throw new Error('Highlight label unavailable. Retry.');return raw;}
function array(raw:unknown){if(!Array.isArray(raw)||raw.length>5)throw new Error('Highlight rows unavailable. Retry.');return raw.map(object);}
function section<T>(decode:()=>T):ReportSection<T>{try{return {data:decode()};}catch{return {error:'Could not load this list. Retry.'};}}
function unique<T extends {key:string}>(rows:T[]){if(new Set(rows.map(r=>r.key)).size!==rows.length)throw new Error('Duplicate highlight.');return rows;}
export function decodeOverviewHighlights(raw:unknown,context:HighlightContext):OverviewHighlights{
 const r=object(raw);
 if(r.version!==1||r.owner!==context.owner||r.month!==context.month||r.timezone!==context.timezone||r.today!==context.today)throw new Error('Highlights changed. Retry to refresh this month.');
 return {
  recent:section(()=>{
   if(!Array.isArray(r.recent)||r.recent.length>5)throw new Error('Invalid recent list');
   for(const value of r.recent){const row=object(value);if(row.row_kind!=='transfer'&&(typeof row.category!=='string'||typeof row.payment_account!=='string'||typeof row.payment_type!=='string'||row.last_four!==null&&!/^\d{4}$/.test(String(row.last_four))))throw new Error('Invalid activity labels');if(row.note!==null&&typeof row.note!=='string')throw new Error('Invalid activity note');}
   return decodeActivityPage({...context,rows:r.recent,has_more:false,next:null},context.owner,context.month,context.timezone).rows;
  }),
  categories:section(()=>unique(array(r.categories).map(c=>{
   if(c.id!==null&&!isUuid(c.id)||c.key!==(c.id??'uncategorized')||!/^#[0-9a-f]{6}$/i.test(String(c.color)))throw new Error('Invalid category');
   const spent=reportCents(c.spent);if(spent<=0)throw new Error('Invalid spending');
   return {id:c.id as string|null,key:String(c.key),name:string(c.name),color:String(c.color),spent};
  }))),
  methods:section(()=>unique(array(r.methods).map(m=>{
   if(!isUuid(m.id)||m.key!==m.id&&m.key!=='cash'||typeof m.archived!=='boolean'||!Number.isSafeInteger(m.count)||Number(m.count)<=0||m.lastFour!==null&&!/^\d{4}$/.test(String(m.lastFour)))throw new Error('Invalid method');
   return {id:m.id,key:String(m.key),name:string(m.name),paymentType:string(m.paymentType),lastFour:m.lastFour as string|null,archived:m.archived,count:Number(m.count),spent:reportCents(m.spent)};
  }))),
 };
}
