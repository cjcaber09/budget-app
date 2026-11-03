import {decimalToCents} from '../../supabase/functions/ocr/shared';
import type {ReportCategory} from './reports';
import type {Transaction} from '../types/database';
import {localDateKey} from './transactionDates';
import {formatMoneyCents} from './money';

export interface BudgetExpense {type:string;amount:number;categoryId?:string|null;transactionDate?:string|null}
export function expenseBudgetWarning(input:BudgetExpense,categories:ReportCategory[],previous?:Transaction,timezone='UTC',currency:Parameters<typeof formatMoneyCents>[1]='USD'):string|null {
 if(input.type!=='expense'||!input.categoryId||!input.transactionDate)return null;
 const category=categories.find(c=>c.id===input.categoryId);
 if(!category)throw new Error('Category budget could not be checked.');
 if(category.budget===null)return `No budget is set for ${category.name} in ${input.transactionDate.slice(0,7)}. Record this expense anyway?`;
 let projected=BigInt(category.spent)+BigInt(decimalToCents(input.amount)!);
 if(previous?.type==='expense'&&previous.category_id===input.categoryId&&
  (previous.transaction_date??localDateKey(new Date(previous.occurred_at),timezone)).slice(0,7)===input.transactionDate.slice(0,7))projected-=BigInt(decimalToCents(previous.amount)!);
 const over=projected-BigInt(category.budget);
 if(over<=0n)return null;
 if(over>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Projected spending exceeds the supported range.');
 return `This expense would put ${category.name} ${formatMoneyCents(Number(over),currency)} over its ${formatMoneyCents(category.budget,currency)} budget for ${input.transactionDate.slice(0,7)}. Record it anyway?`;
}
