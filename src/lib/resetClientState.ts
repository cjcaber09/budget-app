import type { QueryClient } from '@tanstack/react-query';
import { useScanStore } from '../stores/useScanStore';
import { usePreferencesStore } from '../stores/usePreferencesStore';

// On sign-out, drop everything cached for the previous user so the next one can't briefly see it.
export function resetClientState(queryClient: QueryClient) {
  queryClient.clear();
  useScanStore.getState().clearPendingImage();
  usePreferencesStore.getState().setProfile(null);
}
