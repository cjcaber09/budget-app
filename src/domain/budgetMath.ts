import type { Transaction, TransactionType } from '../types/database';
import {decimalToCents} from '../../supabase/functions/ocr/shared';

function sumMoney(rows:Transaction[]):number {
  const cents=rows.reduce((total,t)=>{const value=decimalToCents(t.amount);if(value===null)throw new Error('Transaction money could not be read.');return total+BigInt(value)*(t.type==='refund'?-1n:1n);},0n);
  if(cents>BigInt(Number.MAX_SAFE_INTEGER)||cents<BigInt(Number.MIN_SAFE_INTEGER))throw new Error('Transaction totals exceed the supported range.');
  return Number(cents)/100;
}

export function sumTransactionsForCategory(
  transactions: Transaction[],
  categoryId: string
): number {
  return sumMoney(transactions.filter((t) => t.category_id === categoryId));
}

export function sumTransactionsByType(transactions: Transaction[], type: TransactionType): number {
  return sumMoney(transactions.filter((t) => t.type === type || type==='expense'&&t.type==='refund'));
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
