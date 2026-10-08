import { useEffect } from "react";
import { AppState } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { usePreferencesStore } from "../stores/usePreferencesStore";
import { localDateKey } from "../domain/transactionDates";
import {
  centsToDecimal,
  decimalToCents,
} from "../../supabase/functions/ocr/shared";
import type { RecurringRule, RecurringFrequency } from "../types/database";
export function useRecurringRules() {
  const profile = usePreferencesStore((s) => s.profile);
  return useQuery({
    queryKey: ["recurringRules", profile?.user_id],
    queryFn: async (): Promise<RecurringRule[]> => {
      const r = await supabase
        .from("recurring_rules")
        .select("*")
        .eq("archived", false);
      if (r.error) throw r.error;
      return r.data;
    },
  });
}
export function useRecurringRule(id: string) {
  return useQuery({
    queryKey: ["recurringRule", id],
    queryFn: async (): Promise<RecurringRule> => {
      const r = await supabase
        .from("recurring_rules")
        .select("*")
        .eq("id", id)
        .single();
      if (r.error) throw r.error;
      return r.data;
    },
    refetchOnMount: "always",
  });
}
export function useRecurringCatchUp() {
  const profile = usePreferencesStore((s) => s.profile);
  const client = useQueryClient();
  const owner = profile?.user_id;
  const timezone = profile?.timezone;
  useEffect(() => {
    if (!owner || !timezone) return;
    let cancelled = false;
    const sync = async () => {
      const day = localDateKey(new Date(), timezone);
      const r = await supabase.rpc("prepare_dashboard", {
        p_month: day.slice(0, 7) + "-01",
      });
      if (!cancelled && !r.error) {
        void client.invalidateQueries({ queryKey: ["transactions"] });
      void client.invalidateQueries({ queryKey: ["paymentMethods"] });
        void client.invalidateQueries({ queryKey: ["monthlyTotals"] });
        void client.invalidateQueries({ queryKey: ["dashboard"] });
      void client.invalidateQueries({ queryKey: ["phoneReminders"] });
      }
    };
    void sync();
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") void sync();
    });
    return () => {
      cancelled = true;
      listener.remove();
    };
  }, [owner, timezone, client]);
}
export interface AddRecurringRuleInput {
  paymentMethodId?:string|null;
  reminderEnabled?: boolean;
  reminderDaysBefore?: number;
  reminderTime?: string;
  categoryId: string;
  amount: number;
  note: string | null;
  frequency: RecurringFrequency;
  nextDueDate?: string;
  monthEnd?: boolean;
}
function useRuleMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddRecurringRuleInput & { id?: string; command?: string },
    ) => {
      const cents = decimalToCents(input.amount);
      if (cents === null) throw new Error("Invalid amount");
      const r = await supabase.rpc("save_recurring_rule", {
        p_rule: {
          ...input,
          amount: centsToDecimal(cents),
          nextDueDate: input.nextDueDate ?? localDateKey(new Date()),
        },
      });
      if (r.error) throw r.error;
      return r.data;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["paymentMethods"] });
      void client.invalidateQueries({ queryKey: ["recurringRules"] });
      void client.invalidateQueries({ queryKey: ["recurringRule"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      void client.invalidateQueries({ queryKey: ["phoneReminders"] });
    },
  });
}
export function useAddRecurringRule() {
  return useRuleMutation();
}
export function useUpdateRecurringRule() {
  return useRuleMutation();
}
export function useSetRecurringRuleActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const r = await supabase.rpc("save_recurring_rule", {
        p_rule: { id, command: active ? "resume" : "pause" },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["paymentMethods"] });
      void client.invalidateQueries({ queryKey: ["recurringRules"] });
      void client.invalidateQueries({ queryKey: ["recurringRule"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      void client.invalidateQueries({ queryKey: ["phoneReminders"] });
    },
  });
}
export function useArchiveRecurringRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r = await supabase.rpc("save_recurring_rule", {
        p_rule: { id, command: "archive" },
      });
      if (r.error) throw r.error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["paymentMethods"] });
      void client.invalidateQueries({ queryKey: ["recurringRules"] });
      void client.invalidateQueries({ queryKey: ["dashboard"] });
      void client.invalidateQueries({ queryKey: ["phoneReminders"] });
    },
  });
}
