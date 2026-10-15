import type {Transaction,Category} from '../types/database';
import type {PaymentMethod} from './paymentMethods';
import type {IncomeSource} from '../hooks/useIncomeSources';
import type {TransactionFormValues} from '../components/TransactionForm';
import type {TransactionItemInput} from '../../supabase/functions/ocr/shared';

export function canRepeatTransaction(transaction:Transaction) {
 return (transaction.type==='income'||transaction.type==='expense')&&!transaction.transfer_id&&!transaction.occurrence_id&&!transaction.recurring_rule_id&&transaction.spending_source!=='recurring';
}
export function repeatTransactionValues(transaction:Transaction,items:TransactionItemInput[],categories:Category[],methods:PaymentMethod[],sources:IncomeSource[],today:string,owner:string):{values:Partial<TransactionFormValues>;warnings:string[]} {
 if(transaction.user_id!==owner||!canRepeatTransaction(transaction))throw new Error('Only your ordinary income and expenses can be repeated.');
 const warnings:string[]=[];
 const category=categories.find(row=>row.id===transaction.category_id&&row.user_id===owner);
 if(transaction.type==='expense'&&!category)warnings.push('Choose a category for this new expense.');
 const method=methods.find(row=>row.id===transaction.payment_method_id&&row.user_id===owner&&!row.archived);
 if(transaction.payment_method_id&&!method)warnings.push('The previous payment method is unavailable. Cash is selected; review it before saving.');
 const source=sources.find(row=>row.id===transaction.income_source_id&&row.user_id===owner&&!row.archived);
 if(transaction.type==='income'&&transaction.income_source_id&&!source)warnings.push('The previous income source is unavailable. Choose another or leave it unspecified.');
 return {warnings,values:{type:transaction.type as 'income'|'expense',amount:String(transaction.amount),note:transaction.note??'',categoryId:transaction.type==='expense'?category?.id??'':'',paymentMethodId:method?.id??null,incomeSourceId:transaction.type==='income'?source?.id??null:null,transactionDate:today,paymentDetails:null,items:items.map(row=>({...row}))}};
}
