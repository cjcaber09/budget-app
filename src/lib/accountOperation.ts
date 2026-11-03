import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFinancialResetStore} from '../stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../stores/useAccountDeletionStore';

export function accountOperationActive(owner=usePreferencesStore.getState().profile?.user_id):boolean {
  if(!owner||usePreferencesStore.getState().profile?.user_id!==owner)return false;
  const reset=useFinancialResetStore.getState(),deletion=useAccountDeletionStore.getState();
  return reset.starting||deletion.starting||reset.pending?.owner===owner||deletion.pending?.owner===owner;
}
