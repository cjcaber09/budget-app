import { create } from 'zustand';

interface ToastState {
  message: string | null;
  showToast: (message: string) => void;
  dismissToast: () => void;
}

let dismissTimer:ReturnType<typeof setTimeout>|undefined;
export const useToastStore = create<ToastState>((set) => ({
  message: null,
  showToast: (message) => {
    clearTimeout(dismissTimer);
    set({ message });
    dismissTimer=setTimeout(()=>{dismissTimer=undefined;set({message:null});},5000);
  },
  dismissToast: () => {clearTimeout(dismissTimer);dismissTimer=undefined;set({ message: null });},
}));
