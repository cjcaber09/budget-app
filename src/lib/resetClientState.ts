import type { QueryClient } from '@tanstack/react-query';
import { useScanStore } from '../stores/useScanStore';
import { usePreferencesStore } from '../stores/usePreferencesStore';
import {useIncomeSourceDraftStore} from '../stores/useIncomeSourceDraftStore';
import { cancelPhoneReminders, serializeNotifications } from './phoneNotifications';
import {clearExportFiles} from './exportFiles';

// On sign-out, drop everything cached for the previous user so the next one can't briefly see it.
export function resetClientState(queryClient: QueryClient) {
  void clearExportFiles().catch(()=>{});
  const owner=usePreferencesStore.getState().profile?.user_id;
  void serializeNotifications(()=>cancelPhoneReminders(owner)).catch(()=>{});
  queryClient.clear();
  useIncomeSourceDraftStore.getState().clear();
  useScanStore.getState().clearPendingImage();
  usePreferencesStore.getState().setProfile(null);
}
