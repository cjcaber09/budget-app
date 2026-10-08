import { useEffect } from "react";
import { AppState } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useSession } from "./useSession";
import {
  deviceTimezone,
  defaultProfile,
  usePreferencesStore,
  type Profile,
} from "../stores/usePreferencesStore";
import { useUiStore } from "../stores/useUiStore";
import { localDateKey } from "../domain/transactionDates";

export function useProfile() {
  const { session,error:authError,refresh:refreshSession } = useSession();
  const owner = session?.user.id;
  const query=useQuery({
    queryKey: ["profile", owner],
    enabled: !!owner,
    retry:1,
    queryFn: async ({signal}): Promise<Profile> => {
      const controller=new AbortController();
      const cancel=()=>controller.abort();signal.addEventListener('abort',cancel,{once:true});
      const timeout=setTimeout(cancel,12000);
      try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", owner!)
        .abortSignal(controller.signal)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
      const { error: insertError } = await supabase
        .from("profiles")
        .upsert(
          {
            user_id: owner!,
            timezone: deviceTimezone(),
            display_name: session?.user.user_metadata?.display_name ?? "",
          },
          { onConflict: "user_id", ignoreDuplicates: true },
        ).abortSignal(controller.signal);
      if (insertError) throw insertError;
      const result = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", owner!)
        .abortSignal(controller.signal)
        .single();
      if (result.error) throw result.error;
      return result.data;
      } finally {clearTimeout(timeout);signal.removeEventListener('abort',cancel);}
    },
  });
  return {...query,owner,authError,refreshSession};
}
export function ProfileBootstrap() {
  const query = useProfile();
  const client = useQueryClient();
  const owner = query.data?.user_id;
  const refetch = query.refetch;
  const stored=usePreferencesStore(s=>s.profile);
  useEffect(() => {
    if (!query.owner) return;
    const next = query.data?.user_id === query.owner ? query.data :
      stored?.user_id === query.owner ? stored : defaultProfile(query.owner);
    const old = stored;
    if(old!==next)usePreferencesStore.getState().setProfile(next);
    if (!old || old.user_id !== next.user_id)
      useUiStore
        .getState()
        .setSelectedMonth(
          `${localDateKey(new Date(), next.timezone).slice(0, 7)}-01`,
        );
    else if (old.timezone !== next.timezone) {
      const now = new Date();
      const previousCurrentMonth = `${localDateKey(now, old.timezone).slice(0, 7)}-01`;
      if (useUiStore.getState().selectedMonth === previousCurrentMonth)
        useUiStore.getState().setSelectedMonth(`${localDateKey(now, next.timezone).slice(0, 7)}-01`);
    }
    if ((old && old.timezone !== next.timezone) || (query.data === next && old !== next))
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "profile",
      });
  }, [query.data,query.owner,stored, client]);
  useEffect(() => {
    if (!owner) return;
    const channel = supabase
      .channel(`profile-${owner}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "budget_tracker",
          table: "profiles",
          filter: `user_id=eq.${owner}`,
        },
        () => void refetch(),
      )
      .subscribe();
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refetch();
    });
    return () => {
      void supabase.removeChannel(channel);
      listener.remove();
    };
  }, [owner, refetch]);
  return null;
}
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<Profile, "user_id">>) => {
      const owner = usePreferencesStore.getState().profile?.user_id;
      if (!owner) throw new Error("Sign in again.");
      const result = await supabase
        .from("profiles")
        .update(patch)
        .eq("user_id", owner)
        .select("*")
        .single();
      if (result.error) throw result.error;
      return result.data as Profile;
    },
    onSuccess: (profile) => {
      if (usePreferencesStore.getState().profile?.user_id !== profile.user_id)
        return;
      client.setQueryData(["profile", profile.user_id], profile);
      usePreferencesStore.getState().setProfile(profile);
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== "profile",
      });
      void client.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
