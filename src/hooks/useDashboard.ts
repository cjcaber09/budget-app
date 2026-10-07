import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import { localDateKey } from "../domain/transactionDates";
import type { DashboardSnapshot } from "../domain/spendingGuidance";

export function useDashboard(month: string) {
  const profile = usePreferencesStore((s) => s.profile);
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setClock(Date.now());
    const timer = setInterval(tick, 30000);
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") tick();
    });
    return () => {
      clearInterval(timer);
      listener.remove();
    };
  }, []);
  const day = localDateKey(new Date(clock), profile?.timezone);
  return useQuery({
    queryKey: ["dashboard", profile?.user_id, profile?.timezone, month, day],
    enabled: !!profile,
    refetchOnMount: "always",
    queryFn: async (): Promise<DashboardSnapshot> => {
      const prepared = await supabase.rpc("prepare_dashboard", {
        p_month: month,
      });
      if (prepared.error) throw prepared.error;
      const result = await supabase.rpc("dashboard_snapshot", {
        p_month: month,
      });
      if (result.error) throw result.error;
      const data = result.data as DashboardSnapshot;
      if (!data?.complete)
        throw Error(
          "Spending guidance is unavailable. Retry to refresh your bills.",
        );
      for (const [key, value] of Object.entries(data))
        if (
          key.endsWith("Cents") &&
          value !== null &&
          !Number.isSafeInteger(value)
        )
          throw Error("The total is outside the supported range.");
      return data;
    },
  });
}
export function useSetMonthlyLimit(month: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (amount: string) => {
      const owner = usePreferencesStore.getState().profile?.user_id;
      if (!owner) throw Error("Sign in again.");
      const result = await supabase
        .from("monthly_limits")
        .upsert(
          { user_id: owner, month, amount, inherited_from: null },
          { onConflict: "user_id,month" },
        );
      if (result.error) throw result.error;
    },
    onSuccess: () => void client.invalidateQueries({ queryKey: ["dashboard"] }),
  });
}
export function useBillCommand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      command: "skip" | "replace" | "link";
      transactionId?: string;
      confirmDifference?: boolean;
    }) => {
      const result = await supabase.rpc("bill_command", {
        p_occurrence: input.id,
        p_command: input.command,
        p_transaction: input.transactionId ? { id: input.transactionId } : null,
        p_confirm_difference: input.confirmDifference ?? false,
      });
      if (result.error) throw result.error;
      return result.data as {
        occurrence: import("../domain/spendingGuidance").BillOccurrence;
      };
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      void client.invalidateQueries({ queryKey: ["transactions"] });
      void client.invalidateQueries({ queryKey: ["monthlyTotals"] });
    },
  });
}
