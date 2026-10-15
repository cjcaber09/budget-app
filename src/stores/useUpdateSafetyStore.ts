import { useId, useLayoutEffect } from 'react';
import { create } from 'zustand';

interface State {
  blockers: string[];
  block: (id: string, active: boolean) => void;
}
export const useUpdateSafetyStore = create<State>(set => ({
  blockers: [],
  block: (id, active) => set(state => ({ blockers: active ? [...state.blockers.filter(key => key !== id), id] : state.blockers.filter(key => key !== id) })),
}));

/** Memory only: never store form values or update secrets here. */
export function useUpdateBlocker(active: boolean) {
  const id = useId();
  useLayoutEffect(() => {
    if (!active) return;
    useUpdateSafetyStore.getState().block(id, true);
    return () => useUpdateSafetyStore.getState().block(id, false);
  }, [id, active]);
}
