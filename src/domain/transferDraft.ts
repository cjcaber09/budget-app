import {isCalendarDate,isUuid} from '../../supabase/functions/ocr/shared';
import {decodeTransactionDraft,type TransactionDraft} from './transactionDraft';
import {transferAmounts} from './transferFees';
import type {TransferFields,TransferCommand} from './transferEntry';
export interface TransferDraft {version:2;kind:'transfer';owner:string;id:string;updatedAt:string;startedAt:string;day:string;timezone:string;currency:string;fields:TransferFields;pending?:TransferCommand}
export type EntryDraft=TransactionDraft|TransferDraft;
export function decodeEntryDraft(raw:string,owner:string):EntryDraft {
 if(raw.length>256000)throw new Error('Saved draft is too large.');
 const d=JSON.parse(raw) as TransferDraft;
 if(d.version!==2)return decodeTransactionDraft(raw,owner);
 const f=d.fields;
 if(d.kind!=='transfer'||d.owner!==owner||!isUuid(d.id)||!Number.isFinite(Date.parse(d.startedAt))||!Number.isFinite(Date.parse(d.updatedAt))||!isCalendarDate(d.day)||typeof d.timezone!=='string'||typeof d.currency!=='string'||!/^[A-Z]{3}$/.test(d.currency)||!f||![f.sourceId,f.destinationId].every(v=>v===''||isUuid(v))||![f.amount,f.fee].every(v=>typeof v==='string'&&v.length<=40)||typeof f.note!=='string'||f.note.length>200||!['added','deducted'].includes(f.feeMode)||!isCalendarDate(f.date)||typeof f.reviewRequired!=='boolean')throw new Error('Saved transfer draft could not be read.');
 new Intl.DateTimeFormat('en',{timeZone:d.timezone}).format(new Date());
 const p=d.pending,t=transferAmounts(f.amount,f.fee,f.feeMode);
 if(p&&(p.operation!=='create'||p.id!==d.id||p.requestId!==d.id||p.sourceId!==f.sourceId||p.destinationId!==f.destinationId||p.sourceId===p.destinationId||!isUuid(p.sourceId)||!isUuid(p.destinationId)||p.date!==f.date||p.note!==(f.note.trim()||null)||!t||p.amount!==(t.received/100).toFixed(2)||p.feeAmount!==(t.fee/100).toFixed(2)||p.feeMode!==(t.fee===0?'added':f.feeMode)||f.reviewRequired))throw new Error('Pending transfer could not be read.');
 return {version:2,kind:'transfer',owner,id:d.id,updatedAt:d.updatedAt,startedAt:d.startedAt,day:d.day,timezone:d.timezone,currency:d.currency,fields:{sourceId:f.sourceId,destinationId:f.destinationId,amount:f.amount,fee:f.fee,feeMode:f.feeMode,date:f.date,note:f.note,reviewRequired:f.reviewRequired},...(p?{pending:{id:p.id,requestId:p.requestId,operation:'create',sourceId:p.sourceId,destinationId:p.destinationId,amount:p.amount,feeAmount:p.feeAmount,feeMode:p.feeMode,date:p.date,note:p.note}}:{})};
}
