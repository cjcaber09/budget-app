import AsyncStorage from '@react-native-async-storage/async-storage';
import type {QueryClient} from '@tanstack/react-query';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useScanStore} from '../stores/useScanStore';
import {useIncomeSourceDraftStore} from '../stores/useIncomeSourceDraftStore';
import {useUiStore} from '../stores/useUiStore';
import {clearExportFiles} from './exportFiles';
import {cancelPhoneReminders,serializeNotifications} from './phoneNotifications';
import {localDateKey} from '../domain/transactionDates';
import {clearTransactionDraft} from './transactionDraftStorage';
export async function resetFinancialClientState(client:QueryClient,owner:string):Promise<void> {
 if(usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('owner_changed');
 await client.cancelQueries();
 await clearTransactionDraft(owner);
 await serializeNotifications(async()=>{
  if(usePreferencesStore.getState().profile?.user_id!==owner)return;
  await cancelPhoneReminders(owner);
  const keys=await AsyncStorage.getAllKeys();const own=keys.filter(key=>key.startsWith(`budget-alerts:${owner}:`));
  if(own.length)await AsyncStorage.multiRemove(own);
 });
 if(usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('owner_changed');
 await clearExportFiles();if(usePreferencesStore.getState().profile?.user_id!==owner)throw new Error('owner_changed');
 client.clear();useIncomeSourceDraftStore.getState().clear();useScanStore.getState().clearPendingImage();
 useUiStore.getState().setSelectedMonth(`${localDateKey(new Date(),usePreferencesStore.getState().profile?.timezone).slice(0,7)}-01`);
 // Saved profile/preferences and the active Auth session stay in place.
}
