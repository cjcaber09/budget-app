import { useState } from "react";
import { View, Text, TextInput, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useSession } from "../hooks/useSession";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import {
  currencies,
  usePreferencesStore,
  type Currency,
} from "../stores/usePreferencesStore";
import { useFormStyles } from "../styles/forms";
import { createThemedStyles, type } from "../styles/theme";
import { createRequestId } from "../domain/ocr";
import { MotionPressable } from "./MotionPressable";
import timezoneNames from "../domain/timezones.json";

const AVATARS = "budget-tracker-avatars";
export function ProfileSettings() {
  const preferences = useProfile();
  const profile = usePreferencesStore((s) => s.profile);
  const { session } = useSession();
  const update = useUpdateProfile();
  const client = useQueryClient();
  const form = useFormStyles();
  const styles = useStyles();
  const [name, setName] = useState(profile?.display_name ?? "");
  const [nameDirty, setNameDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [orphans, setOrphans] = useState<string[]>([]);
  const [currency, setCurrency] = useState<Currency | null>(null);
  const [search, setSearch] = useState("");
  const [zoneOpen, setZoneOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nonce, setNonce] = useState("");
  const [nonceNeeded, setNonceNeeded] = useState(false);
  const avatar = useQuery({
    queryKey: ["avatar", profile?.user_id, profile?.avatar_path],
    enabled: !!profile?.avatar_path,
    refetchInterval: 240000,
    queryFn: async () => {
      const r = await supabase.storage
        .from(AVATARS)
        .createSignedUrl(profile!.avatar_path!, 300);
      if (r.error) throw r.error;
      return r.data.signedUrl;
    },
  });
  if (!profile) return null;
  async function changeAvatar(remove = false) {
    if (!profile || busy) return;
    setBusy(true);
    setError("");
    let uploaded: string | null = null;
    const owner = profile.user_id;
    const previous = profile.avatar_path;
    try {
      if (!remove) {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted)
          throw new Error("Allow photo access to choose a profile image.");
        const picked = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 1,
        });
        if (picked.canceled) return;
        const asset = picked.assets[0];
        if ((asset.fileSize ?? 0) > 10485760)
          throw new Error("Choose an image smaller than 10 MB.");
        const image = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 512 } }],
          {
            format: ImageManipulator.SaveFormat.JPEG,
            compress: 0.8,
            base64: true,
          },
        );
        if (!image.base64) throw new Error("Could not prepare the image.");
        const bytes = Uint8Array.from(atob(image.base64), (ch) =>
          ch.charCodeAt(0),
        );
        if (bytes.byteLength > 2097152) throw new Error("Choose a smaller image.");
        uploaded = `${owner}/${createRequestId()}.jpg`;
        const result = await supabase.storage
          .from(AVATARS)
          .upload(uploaded, bytes.buffer, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (result.error) throw result.error;
      }
      if (usePreferencesStore.getState().profile?.user_id !== owner)
        throw new Error("Account changed. Try again.");
      let query = supabase
        .from("profiles")
        .update({ avatar_path: uploaded })
        .eq("user_id", owner);
      query = previous
        ? query.eq("avatar_path", previous)
        : query.is("avatar_path", null);
      const saved = await query.select("*").maybeSingle();
      if (saved.error) throw saved.error;
      if (!saved.data)
        throw new Error(
          "Your photo changed on another device. Refresh and try again.",
        );
      usePreferencesStore.getState().setProfile(saved.data);
      client.setQueryData(["profile", owner], saved.data);
      uploaded = null;
      if (previous) {
        const removed = await supabase.storage.from(AVATARS).remove([previous]);
        if (removed.error) {
          setOrphans((paths) => [...paths, previous]);
          setMessage(
            "Photo saved. The old image could not be removed; retry cleanup.",
          );
        }
      }
      void client.invalidateQueries({ queryKey: ["profile"] });
      void client.invalidateQueries({ queryKey: ["avatar"] });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not change your photo. Try again.",
      );
    } finally {
      if (uploaded) {
        const path = uploaded;
        const result = await supabase.storage.from(AVATARS).remove([path]);
        if (result.error) setOrphans((paths) => [...paths, path]);
      }
      setBusy(false);
    }
  }
  async function changePassword() {
    if (busy) return;
    setError("");
    setMessage("");
    if (!current || password.length < 8 || password !== confirm) {
      setError(
        "Enter your current password and matching new passwords of at least 8 characters.",
      );
      return;
    }
    if (password === current) {
      setError("Choose a different new password.");
      return;
    }
    setBusy(true);
    try {
      if (!session?.user.email)
        throw new Error("Sign in again before changing your password.");
      if (!nonceNeeded) {
        const verified = await supabase.auth.signInWithPassword({
          email: session.user.email,
          password: current,
        });
        if (verified.error)
          throw new Error("Your current password was not accepted.");
        if (verified.data.user?.id !== profile!.user_id)
          throw new Error("Account changed. Sign in again.");
      }
      const result = await supabase.auth.updateUser({
        password,
        current_password: current,
        ...(nonceNeeded ? { nonce } : {}),
      });
      if (result.error) {
        if (result.error.code === "reauthentication_needed") {
          const r = await supabase.auth.reauthenticate();
          if (r.error) throw r.error;
          setNonceNeeded(true);
          setMessage(
            "Enter the verification code sent to your email, then save again.",
          );
          return;
        }
        throw result.error;
      }
      setCurrent("");
      setPassword("");
      setConfirm("");
      setNonce("");
      setNonceNeeded(false);
      setPasswordOpen(false);
      setMessage("Password changed.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not change your password. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const zones =
    (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone") ?? timezoneNames;
  const visibleZones = [...new Set(["UTC", profile.timezone, ...zones])]
    .filter((z) => z.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 40);
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          Your profile
        </Text>
        {preferences.isError && <View style={{gap:8}}>
          <Text accessibilityRole="alert" style={form.error}>Saved preferences could not sync. You can keep using the app with the current settings.</Text>
          <MotionPressable style={form.secondaryButton} onPress={()=>void preferences.refetch()}><Text style={form.chipTextSelected}>Retry preferences sync</Text></MotionPressable>
        </View>}
        <View style={styles.profileRow}>
          {avatar.data ? (
            <Image
              source={{ uri: avatar.data }}
              accessibilityLabel="Profile photo"
              style={styles.avatar}
            />
          ) : (
            <View style={styles.initials}>
              <Text style={styles.initialsText}>
                {(profile.display_name || session?.user.email || "You")
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.body}>
              {session?.user.email ?? "Signed in"}
            </Text>
            <Text style={styles.caption}>Your email is read-only.</Text>
          </View>
        </View>
        <View style={form.optionRow}>
          <MotionPressable
            disabled={busy}
            style={form.chip}
            onPress={() => void changeAvatar()}
          >
            <Text style={form.chipText}>
              {busy ? "Working…" : "Choose photo"}
            </Text>
          </MotionPressable>
          {profile.avatar_path && (
            <MotionPressable
              disabled={busy}
              style={form.chip}
              onPress={() => void changeAvatar(true)}
            >
              <Text style={form.chipText}>Remove photo</Text>
            </MotionPressable>
          )}
        </View>
        <Text style={form.label}>Display name</Text>
        <TextInput
          accessibilityLabel="Display name"
          style={form.input}
          value={nameDirty ? name : profile.display_name}
          maxLength={100}
          onChangeText={(v) => {
            setName(v);
            setNameDirty(true);
          }}
        />
        <MotionPressable
          disabled={update.isPending || !nameDirty}
          style={form.button}
          onPress={() =>
            update.mutate(
              { display_name: name.trim() },
              {
                onSuccess: () => {
                  setNameDirty(false);
                  setMessage("Name saved.");
                },
              },
            )
          }
        >
          <Text style={form.buttonText}>Save name</Text>
        </MotionPressable>
        {update.isError&&update.variables?.display_name!==undefined&&<Text accessibilityRole="alert" style={form.error}>Could not save your name. Your draft is still here; try Save name again.</Text>}
      </View>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.heading}>
          Preferences
        </Text>
        <Text style={form.label}>Appearance</Text>
        <View style={form.optionRow}>
          {(["system", "light", "dark"] as const).map((value) => (
            <MotionPressable
              key={value}
              disabled={update.isPending}
              accessibilityState={{ selected: profile.appearance === value }}
              style={[
                form.chip,
                profile.appearance === value && form.chipSelected,
              ]}
              onPress={() => update.mutate({ appearance: value })}
            >
              <Text
                style={
                  profile.appearance === value
                    ? form.chipTextSelected
                    : form.chipText
                }
              >
                {value[0].toUpperCase() + value.slice(1)}
              </Text>
            </MotionPressable>
          ))}
        </View>
        {update.isError&&update.variables?.appearance!==undefined&&<Text accessibilityRole="alert" style={form.error}>Could not save appearance. Your last saved setting remains active. Try again.</Text>}
        <Text style={form.label}>Currency · {profile.currency}</Text>
        <View style={form.optionRow}>
          {currencies.map((value) => (
            <MotionPressable
              key={value}
              accessibilityState={{ selected: profile.currency === value }}
              style={[
                form.chip,
                profile.currency === value && form.chipSelected,
              ]}
              onPress={() => {
                if (value !== profile.currency) setCurrency(value);
              }}
            >
              <Text
                style={
                  profile.currency === value
                    ? form.chipTextSelected
                    : form.chipText
                }
              >
                {value}
              </Text>
            </MotionPressable>
          ))}
        </View>
        {currency && (
          <View style={{ gap: 8, marginTop: 16 }}>
            <Text style={styles.body}>
              Change all amounts to {currency}? Existing numbers stay the same.
              No exchange-rate conversion will occur.
            </Text>
            <View style={form.optionRow}>
              <MotionPressable
                disabled={update.isPending}
                style={form.chip}
                onPress={() =>
                  update.mutate(
                    { currency },
                    { onSuccess: () => setCurrency(null) },
                  )
                }
              >
                <Text style={form.chipText}>Change unit to {currency}</Text>
              </MotionPressable>
              <MotionPressable
                style={form.chip}
                onPress={() => setCurrency(null)}
              >
                <Text style={form.chipText}>Cancel</Text>
              </MotionPressable>
            </View>
          </View>
        )}
        {update.isError&&update.variables?.currency!==undefined&&<Text accessibilityRole="alert" style={form.error}>Could not save currency. Your last saved unit remains active. Confirm the change to try again.</Text>}
        <Text style={form.label}>Financial timezone</Text>
        <MotionPressable
          style={form.chip}
          onPress={() => setZoneOpen(!zoneOpen)}
        >
          <Text style={form.chipText}>{profile.timezone}</Text>
        </MotionPressable>
        <Text style={styles.caption}>
          Controls today, month boundaries, and scheduled expenses. Explicit
          receipt dates stay unchanged.
        </Text>
        {zoneOpen && (
          <View>
            <TextInput
              accessibilityLabel="Search timezones"
              style={form.input}
              value={search}
              onChangeText={setSearch}
              placeholder="Search city or region"
            />
            {visibleZones.map((timezone) => (
              <View key={timezone}>
              <MotionPressable
                disabled={update.isPending}
                key={timezone}
                style={styles.zone}
                onPress={() =>
                  update.mutate(
                    { timezone },
                    {
                      onSuccess: () => {
                        setZoneOpen(false);
                        setSearch("");
                      },
                    },
                  )
                }
              >
                <Text style={styles.body}>{timezone.replaceAll("_", " ")}</Text>
              </MotionPressable>
              {update.isError&&update.variables?.timezone===timezone&&<Text accessibilityRole="alert" style={form.error}>Could not save this timezone. Your last saved timezone remains active. Try again.</Text>}
              </View>
            ))}
            {visibleZones.length === 0 && (
              <Text style={styles.caption}>No matching timezones.</Text>
            )}
          </View>
        )}
      </View>
      <View style={styles.section}>
        <MotionPressable onPress={() => setPasswordOpen(!passwordOpen)}>
          <Text style={styles.heading}>Change password</Text>
        </MotionPressable>
        {passwordOpen && (
          <View>
            {[
              ["Current password", current, setCurrent],
              ["New password", password, setPassword],
              ["Confirm new password", confirm, setConfirm],
            ].map(([label, value, set]) => (
              <View key={label as string}>
                <Text style={form.label}>{label as string}</Text>
                <TextInput
                  secureTextEntry
                  accessibilityLabel={label as string}
                  autoCapitalize="none"
                  style={form.input}
                  value={value as string}
                  onChangeText={set as (value: string) => void}
                />
              </View>
            ))}
            {nonceNeeded && (
              <TextInput
                style={form.input}
                accessibilityLabel="Verification code"
                value={nonce}
                onChangeText={setNonce}
                keyboardType="number-pad"
              />
            )}
            <MotionPressable
              disabled={busy}
              style={form.button}
              onPress={() => void changePassword()}
            >
              <Text style={form.buttonText}>
                {busy ? "Updating…" : "Save new password"}
              </Text>
            </MotionPressable>
          </View>
        )}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={form.error}>
          {error}
        </Text>
      )}
      {!!message && (
        <Text accessibilityLiveRegion="polite" style={styles.caption}>
          {message}
        </Text>
      )}
      {orphans.length > 0 && (
        <MotionPressable
          disabled={busy}
          style={form.secondaryButton}
          onPress={async () => {
            const currentProfile = usePreferencesStore.getState().profile;
            if (!currentProfile) return;
            setBusy(true);
            const paths = orphans.filter(
              (path) =>
                path.startsWith(currentProfile.user_id + "/") &&
                path !== currentProfile.avatar_path,
            );
            const result = await supabase.storage.from(AVATARS).remove(paths);
            if (result.error)
              setError("Could not remove the unused photos. Try again.");
            else {
              setOrphans([]);
              setMessage("Unused photos removed.");
            }
            setBusy(false);
          }}
        >
          <Text style={form.chipText}>Retry photo cleanup</Text>
        </MotionPressable>
      )}
    </View>
  );
}
const useStyles = createThemedStyles((c) => ({
  container: { gap: 28 },
  section: {
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingBottom: 24,
  },
  heading: { ...type.heading, color: c.text, paddingVertical: 4 },
  body: { ...type.body, color: c.text },
  caption: { ...type.label, fontWeight: "400", color: c.muted },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32 },
  initials: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: c.selected,
    alignItems: "center",
    justifyContent: "center",
  },
  initialsText: { ...type.heading, color: c.primary },
  zone: {
    paddingVertical: 14,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
}));
