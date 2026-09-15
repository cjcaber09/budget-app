import { create } from 'zustand';
import { startOfMonth, formatISO } from 'date-fns';

function currentMonthKey(): string {
  return formatISO(startOfMonth(new Date()), { representation: 'date' });
}

interface UiState {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  selectedMonth: currentMonthKey(),
  setSelectedMonth: (month) => set({ selectedMonth: month }),
}));
