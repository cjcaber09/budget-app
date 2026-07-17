import { create } from 'zustand';

interface ToastState {
  message: string | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message) => set({ message }),
  dismissToast: () => set({ message: null }),
}));
