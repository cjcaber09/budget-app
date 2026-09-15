import type { Transaction } from '../types/database';

export function sumTransactionsForCategory(
  transactions: Transaction[],
  categoryId: string
): number {
  return transactions
    .filter((t) => t.category_id === categoryId)
    .reduce((total, t) => total + t.amount, 0);
}

export type BudgetStatusLevel = 'ok' | 'warning' | 'over';

export interface BudgetStatus {
  budgeted: number;
  spent: number;
  percentUsed: number;
  status: BudgetStatusLevel;
}

export function computeBudgetStatus(budgeted: number, spent: number): BudgetStatus {
  const percentUsed = budgeted === 0 ? (spent > 0 ? Infinity : 0) : (spent / budgeted) * 100;
  let status: BudgetStatusLevel = 'ok';
  if (percentUsed >= 100) status = 'over';
  else if (percentUsed >= 80) status = 'warning';
  return { budgeted, spent, percentUsed, status };
}
