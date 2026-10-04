import { create } from 'zustand';

export interface PreparedScanImage {
  uri: string;
  base64: string;
  mimeType: 'image/jpeg';
}

export interface PendingScanImage extends PreparedScanImage {
  requestId: string;
}

interface ScanState {
  pendingImage: PendingScanImage | null;
  setPendingImage: (image: PendingScanImage) => void;
  clearPendingImage: () => void;
}

// In-memory handoff from the FAB to the Add Transaction screen. Deliberately not a
// URL param: params are reachable by any deep link, and base64 is too large anyway.
export const useScanStore = create<ScanState>((set) => ({
  pendingImage: null,
  setPendingImage: (pendingImage) => set({ pendingImage }),
  clearPendingImage: () => set({ pendingImage: null }),
}));
