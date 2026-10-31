import type {Category} from '../types/database';
import type {DraftMethod} from './offlineDraftChoices';
import type {IncomeSource} from '../hooks/useIncomeSources';
import type {AddTransactionInput} from '../hooks/useTransactions';

export function manualDraftSelectionError(input:AddTransactionInput,owner:string,categories:Category[],methods:DraftMethod[],sources:IncomeSource[]):string|null {
  if(categories.some(c=>c.user_id!==owner)||methods.some(m=>m.user_id!==owner)||sources.some(s=>s.user_id!==owner))return 'Could not verify your choices. Refresh and retry.';
  if(input.type==='expense'&&!categories.some(c=>c.id===input.categoryId))return 'This category is no longer available. Choose a category and retry.';
  const method=methods.find(m=>input.paymentMethodId?m.id===input.paymentMethodId:m.method==='cash');
  if(!method||method.archived)return 'This payment method is no longer available. Choose another method and retry.';
  if(input.type==='income'&&input.incomeSourceId&&!sources.some(s=>s.id===input.incomeSourceId&&!s.archived))return 'This income source is no longer available. Choose another source or clear it.';
  return null;
}
