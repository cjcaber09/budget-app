import { create } from "zustand";
export const currencies = [
  "USD",
  "PHP",
  "EUR",
  "GBP",
  "SGD",
  "AUD",
  "CAD",
  "NZD",
  "MYR",
  "HKD",
] as const;
export type Currency = (typeof currencies)[number];
export interface Profile {
  user_id: string;
  display_name: string;
  avatar_path: string | null;
  appearance: "system" | "light" | "dark";
  currency: Currency;
  timezone: string;
}
interface Preferences {
  profile: Profile | null;
  ready: boolean;
  setProfile: (profile: Profile | null) => void;
}
export const usePreferencesStore = create<Preferences>((set) => ({
  profile: null,
  ready: false,
  setProfile: (profile) => set({ profile, ready: !!profile }),
}));
export function deviceTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; }
  catch { return "UTC"; }
}
export function defaultProfile(user_id: string, display_name = ""): Profile {
  return { user_id, display_name, avatar_path: null, appearance: "system", currency: "USD", timezone: deviceTimezone() };
}
export function activeTimezone() {
  return usePreferencesStore.getState().profile?.timezone ?? deviceTimezone();
}
