import {create} from 'zustand';

// Connectivity is a hint, not proof that the server is reachable.
export const useConnectivityStore = create<{online: boolean | null}>(() => ({online: null}));
