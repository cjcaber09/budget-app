import { usePreferencesStore } from "../stores/usePreferencesStore";
export function formatMoneyCents(cents:number,currency=usePreferencesStore.getState().profile?.currency??"USD") {
  if(!Number.isSafeInteger(cents))throw new Error('This amount exceeds the supported range.');
  const value=BigInt(cents),absolute=value<0n?-value:value;
  const whole=value/100n;
  const integer=whole===0n&&value<0n?-0:Number(whole);
  const fraction=String(absolute%100n).padStart(2,'0');
  return new Intl.NumberFormat('en-US',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).formatToParts(integer).map(part=>part.type==='fraction'?fraction:part.value).join('');
}
export function useMoneyCents() {
  const currency=usePreferencesStore(s=>s.profile?.currency??'USD');
  return (cents:number)=>formatMoneyCents(cents,currency);
}
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
