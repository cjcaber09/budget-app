export interface BudgetAlertInput {
  month: string;
  currentMonth: string;
  limitCents: number | null;
  expenseCents: number;
  categories: {id:string;name:string;spent:number;limit:number}[];
}
export function budgetAlertLevels(input: BudgetAlertInput) {
  if(input.month!==input.currentMonth)return [];
  return [{id:'monthly',name:'Monthly budget',spent:input.expenseCents,limit:input.limitCents??0},...input.categories]
    .filter(row=>Number.isSafeInteger(row.spent)&&Number.isSafeInteger(row.limit)&&row.limit>0)
    .map(row=>({...row,level:row.spent>=row.limit?100:row.spent*100>=row.limit*80?80:0}));
}
export function alertMessage(name:string,spent:number,limit:number,level:number) {
  return level===80?`${name} is almost at its limit (80%).`:spent===limit?`${name} has reached its limit.`:`${name} has exceeded its limit.`;
}
