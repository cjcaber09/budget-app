import { usePreferencesStore } from "../stores/usePreferencesStore";
export function formatMoney(
  amount: number,
  currency = usePreferencesStore.getState().profile?.currency ?? "USD",
  compact = false,
) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
  }).format(amount);
}
export function useMoney() {
  const currency = usePreferencesStore(
    (state) => state.profile?.currency ?? "USD",
  );
  return (amount: number, compact = false) =>
    formatMoney(amount, currency, compact);
}
