import { usePreferencesStore } from "../stores/usePreferencesStore";
export function transactionListKey(month: string) {
  const p = usePreferencesStore.getState().profile;
  return p
    ? (["transactions", month, p.user_id, p.timezone] as const)
    : (["transactions", month] as const);
}
