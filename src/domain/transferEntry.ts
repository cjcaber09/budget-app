import {isCalendarDate,isUuid,decimalToCents,MAX_MONEY_CENTS,centsToDecimal} from '../../supabase/functions/ocr/shared';
import type {PaymentTransfer} from './paymentMethods';
import type {TransferFeeMode} from './transferFees';
export interface TransferCommand {id:string;requestId:string;operation:'create'|'update'|'delete';expectedVersion?:number;sourceId?:string;destinationId?:string;amount?:string;feeAmount?:string;feeMode?:TransferFeeMode;date?:string;note?:string|null}
export interface TransferFields {sourceId:string;destinationId:string;amount:string;fee:string;feeMode:TransferFeeMode;date:string;note:string;reviewRequired:boolean}
export function decodeTransfer(value:unknown,owner:string,id?:string):PaymentTransfer {
 const f=value as PaymentTransfer&{user_id:string};
 const amount=typeof f?.amount==='string'?decimalToCents(f.amount):null,fee=typeof f?.fee_amount==='string'?decimalToCents(f.fee_amount):null;
 if(!f||f.user_id!==owner||!isUuid(f.id)||(id&&f.id!==id)||!isUuid(f.source_id)||!isUuid(f.destination_id)||f.source_id===f.destination_id||!isCalendarDate(f.transfer_date)||amount===null||amount<=0||fee===null||fee<0||amount+fee>MAX_MONEY_CENTS||!['added','deducted'].includes(f.fee_mode??'')||!Number.isSafeInteger(f.version)||f.version!<1||!(f.note===null||typeof f.note==='string'&&f.note.length<=200))throw new Error('Transfer details could not be confirmed. Refresh and retry.');
 return f;
}
export function canonicalTransferCommand(input:TransferCommand):TransferCommand {
 if(!isUuid(input.id)||!isUuid(input.requestId)||!['create','update','delete'].includes(input.operation)||input.operation==='create'&&input.requestId!==input.id||input.operation!=='create'&&(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion!<1))throw new Error('Transfer request is invalid. Reload and review.');
 const base={id:input.id,requestId:input.requestId,operation:input.operation,...(input.operation==='create'?{}:{expectedVersion:input.expectedVersion})};
 if(input.operation==='delete')return base;
 const amount=typeof input.amount==='string'&&/^\d+(?:\.\d{0,2})?$/.test(input.amount)?decimalToCents(input.amount):null;
 const fee=input.feeAmount===undefined?0:typeof input.feeAmount==='string'&&/^\d+(?:\.\d{0,2})?$/.test(input.feeAmount)?decimalToCents(input.feeAmount):null;
 if(!isUuid(input.sourceId)||!isUuid(input.destinationId)||input.sourceId===input.destinationId||!isCalendarDate(input.date)||amount===null||amount<=0||fee===null||fee<0||amount+fee>MAX_MONEY_CENTS||!['added','deducted'].includes(input.feeMode??'added')||input.note!=null&&(typeof input.note!=='string'||input.note.length>200))throw new Error('Choose two different accounts, valid amounts and a date.');
 return {...base,sourceId:input.sourceId,destinationId:input.destinationId,amount:centsToDecimal(amount),feeAmount:centsToDecimal(fee),feeMode:fee===0?'added':input.feeMode??'added',date:input.date,note:input.note?.trim()||null};
}
