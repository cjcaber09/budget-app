import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFinancialResetStore} from '../stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../stores/useAccountDeletionStore';

export function useAccountOperation():boolean {
  const owner=usePreferencesStore(state=>state.profile?.user_id);
  const reset=useFinancialResetStore(state=>!!owner&&(state.starting||state.pending?.owner===owner));
  const deletion=useAccountDeletionStore(state=>!!owner&&(state.starting||state.pending?.owner===owner));
  return reset||deletion;
}
