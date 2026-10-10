import { isCalendarDate } from '../../supabase/functions/ocr/shared';
import { TZDate } from '@date-fns/tz';
import { activeTimezone } from '../stores/usePreferencesStore';
export function localDateKey(value: Date,zone=activeTimezone()): string {
  const date=new TZDate(value.getTime(),zone);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
export function occurrenceForDate(day: string, scanStartedAt: string,zone=activeTimezone()): string {
  if (!isCalendarDate(day)) throw new Error('Enter a valid transaction date.');
  if (day === localDateKey(new Date(scanStartedAt),zone)) return scanStartedAt;
  const [year,month,date] = day.split('-').map(Number);
  const value = new TZDate(0,zone); value.setFullYear(year,month-1,date); value.setHours(12,0,0,0);
  return new Date(value.getTime()).toISOString();
}
export function localMonthRange(month: string,zone=activeTimezone()) {
  const [year,number] = month.split('-').map(Number);
  const start = new TZDate(0,zone); start.setFullYear(year,number-1,1); start.setHours(0,0,0,0);
  const end = new TZDate(0,zone); end.setFullYear(year,number,1); end.setHours(0,0,0,0);
  return { start:new Date(start.getTime()).toISOString(),end:new Date(end.getTime()).toISOString(),startDay:localDateKey(start,zone),endDay:localDateKey(end,zone) };
}
export function monthFilter(month: string,zone=activeTimezone()): string {
  const range = localMonthRange(month,zone);
  return `and(transaction_date.gte.${range.startDay},transaction_date.lt.${range.endDay}),and(transaction_date.is.null,occurred_at.gte.${range.start},occurred_at.lt.${range.end})`;
}
export function effectiveDate(row: { transaction_date?: string | null; financial_date?:string; occurred_at: string }): string {
  return row.transaction_date ?? row.financial_date ?? localDateKey(new Date(row.occurred_at));
}
