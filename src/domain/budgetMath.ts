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

export type AlertThreshold = 80 | 100;

export interface ThresholdCrossing {
  crossed: boolean;
  threshold: AlertThreshold | null;
}

export function didCrossThreshold(
  budgeted: number,
  previousSpent: number,
  newSpent: number
): ThresholdCrossing {
  if (budgeted <= 0) return { crossed: false, threshold: null };

  const previousPercent = (previousSpent / budgeted) * 100;
  const newPercent = (newSpent / budgeted) * 100;

  if (previousPercent < 100 && newPercent >= 100) {
    return { crossed: true, threshold: 100 };
  }
  if (previousPercent < 80 && newPercent >= 80) {
    return { crossed: true, threshold: 80 };
  }
  return { crossed: false, threshold: null };
}
