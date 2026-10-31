import {encryptedStorage as AsyncStorage} from './encryptedStorage';
import {decodeOfflineDraftChoices, type OfflineDraftChoices} from '../domain/offlineDraftChoices';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useFinancialResetStore} from '../stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../stores/useAccountDeletionStore';

const prefix = 'budget-tracker:draft-choices:v1:';
const generations = new Map<string, number>();
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {const next = queue.catch(() => {}).then(task); queue = next; return next;}
export function loadOfflineDraftChoices(owner: string) {
  return serial(async () => {const raw = await AsyncStorage.getItem(prefix + owner); return raw ? decodeOfflineDraftChoices(raw, owner) : null;});
}
export function offlineChoicesGeneration(owner: string) {return generations.get(owner) ?? 0;}
export async function saveOfflineDraftChoices(choices: OfflineDraftChoices, generation = offlineChoicesGeneration(choices.owner)) {
  const safe = decodeOfflineDraftChoices(JSON.stringify(choices), choices.owner);
  return serial(async () => {
    const reset = useFinancialResetStore.getState(), deletion = useAccountDeletionStore.getState();
    if (generation !== offlineChoicesGeneration(choices.owner) || usePreferencesStore.getState().profile?.user_id !== choices.owner || reset.starting || reset.pending?.owner === choices.owner || deletion.starting || deletion.pending?.owner === choices.owner) return;
    await AsyncStorage.setItem(prefix + choices.owner, JSON.stringify(safe));
  });
}
export function clearOfflineDraftChoices(owner: string) {
  generations.set(owner, offlineChoicesGeneration(owner) + 1);
  return serial(() => AsyncStorage.removeItem(prefix + owner));
}
