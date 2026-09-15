import { addWeeks, addMonths, isAfter } from 'date-fns';
import type { RecurringFrequency } from '../types/database';

export function computeNextOccurrence(currentDate: Date, frequency: RecurringFrequency): Date {
  return frequency === 'weekly' ? addWeeks(currentDate, 1) : addMonths(currentDate, 1);
}

export function getDueOccurrences(
  nextOccurrenceDate: Date,
  frequency: RecurringFrequency,
  asOf: Date
): Date[] {
  const occurrences: Date[] = [];
  let cursor = nextOccurrenceDate;

  while (!isAfter(cursor, asOf)) {
    occurrences.push(cursor);
    cursor = computeNextOccurrence(cursor, frequency);
  }

  return occurrences;
}
