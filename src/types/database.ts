export type RecurringFrequency = 'weekly' | 'monthly';

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
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  note: string | null;
  occurred_at: string; // ISO timestamp
  recurring_rule_id: string | null;
}

export interface RecurringRule {
  id: string;
  user_id: string;
  category_id: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
  next_occurrence_date: string; // ISO date string
  active: boolean;
}
