export type RecurringFrequency = 'weekly' | 'monthly';
export type TransactionType = 'expense' | 'income';

export interface Category {
  id: string;
  user_id: string;
  name: string;
  color: string;
  icon: string;
  is_default: boolean;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  month: string; // ISO date string, first-of-month
  amount: number;
}

export interface Transaction {
  payment_method_id?:string|null;
  occurrence_id?: string|null;
  spending_source?: 'manual'|'recurring';
  transaction_date?: string | null;
  payment_details?: import('../../supabase/functions/ocr/shared').PaymentDetails | null;
  id: string;
  user_id: string;
  category_id: string | null; // null for income (income isn't budgeted per-category)
  amount: number;
  note: string | null;
  occurred_at: string; // ISO timestamp
  recurring_rule_id: string | null;
  type: TransactionType;
}

export interface RecurringRule {
  payment_method_id?:string|null;
  reminder_enabled?: boolean;
  reminder_days_before?: number;
  reminder_time?: string;
  anchor_day?: number;
  month_end?: boolean;
  archived?: boolean;
  paused_at?: string|null;
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
  next_occurrence_date: string; // ISO date string
  active: boolean;
}
