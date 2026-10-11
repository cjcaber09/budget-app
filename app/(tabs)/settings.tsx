import { formatMoney } from "../../src/domain/money";
import { useState, useRef } from "react";
import { ScrollView, View, Text, Linking } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import {
  FileText,
  Trash,
  ChevronRight,
  Plus,
  LogOut,
  ChevronDown,
  UserRound, Settings2, Wallet, Bell, Tags,
  CircleHelp,
} from "lucide-react-native";
import { useCategories } from "../../src/hooks/useCategories";
import { useRecurringRules } from "../../src/hooks/useRecurringRules";
import {
  useOcrScans,
  useDeleteOcrScan,
  getOcrDownloadUrl,
  type OcrScanRow,
} from "../../src/hooks/useOcr";
import { useToastStore } from "../../src/stores/useToastStore";
import { supabase } from "../../src/lib/supabase";
import { usePageLayout } from "../../src/styles/pageLayout";
import { createThemedStyles, type, useColors } from "../../src/styles/theme";
import { ScreenHeading } from "../../src/components/ScreenHeading";
import { MotionPressable } from "../../src/components/MotionPressable";
import { QueryState } from "../../src/components/QueryState";
import { ProfileSettings } from "../../src/components/ProfileSettings";
import { useFormStyles } from "../../src/styles/forms";
import { NotificationSettings } from "../../src/components/NotificationSettings";
import { createRequestId } from "../../src/domain/ocr";
import { PaymentMethodsSettings } from "../../src/components/PaymentMethodPicker";
import {IncomeSourcesSettings} from '../../src/components/IncomeSources';
import {AccountDeletionSettings} from '../../src/components/AccountDeletion';
import {FinancialResetSettings} from '../../src/components/FinancialReset';
import {usePreferencesStore} from '../../src/stores/usePreferencesStore';
import {SettingsTabStrip} from '../../src/components/SettingsTabStrip';
import {useHelpStore} from '../../src/stores/useHelpStore';

const SETTINGS_TABS = [
  {id: 'organize', label: 'Categories & Bills', icon: Tags},
  {id: 'profile', label: 'Profile', icon: UserRound},
  {id: 'preferences', label: 'Preferences', icon: Settings2},
  {id: 'sources', label: 'Sources', icon: Wallet},
  {id: 'notifications', label: 'Notifications', icon: Bell},
] as const;
type SettingsTab = typeof SETTINGS_TABS[number]['id'];

export default function SettingsScreen() {
  const owner = usePreferencesStore(state => state.profile?.user_id);
  return <SettingsContent key={owner ?? 'signed-out'}/>;
}

function SettingsContent() {
  const router = useRouter();
  const styles = useStyles();
  const pageLayout = usePageLayout({ safeTop: true });
  const colors = useColors();
  const form = useFormStyles();
  const categories = useCategories();
  const recurringRules = useRecurringRules();
  const scans = useOcrScans();
  const { mutate: deleteScan } = useDeleteOcrScan();
  const [tab, setTab] = useState<SettingsTab>('organize');
  const [visited, setVisited] = useState<SettingsTab[]>(['organize']);
  const content = useRef<ScrollView>(null);
  function selectTab(next: SettingsTab) {
    setTab(next);
    setVisited(current => current.includes(next) ? current : [...current, next]);
    content.current?.scrollTo({y: 0, animated: false});
  }
  async function openScan(scan: OcrScanRow) {
    try {
      await Linking.openURL(await getOcrDownloadUrl(scan));
    } catch {
      useToastStore.getState().showToast("Couldn't open that scan.");
    }
  }
  return (
    <View style={pageLayout.screen}>
      <View style={{alignItems: 'center', paddingHorizontal: 24, paddingTop: pageLayout.scrollContent.paddingTop, gap: 16}}>
        <View style={[pageLayout.workspace, {gap: 16}]}>
          <ScreenHeading title="Settings" action={
            <MotionPressable accessibilityLabel="Logout" style={styles.signOutButton} onPress={() => void supabase.auth.signOut()}>
              <LogOut size={17} color={colors.danger}/><Text style={styles.signOutText}>Logout</Text>
            </MotionPressable>
          }/>
          <SettingsTabStrip tabs={SETTINGS_TABS} selected={tab} onSelect={selectTab}/>
        </View>
      </View>
    <ScrollView ref={content} showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={pageLayout.screen}
      contentContainerStyle={[pageLayout.scrollContent, {paddingTop: 16}]}
    >
      <View style={pageLayout.workspace}>
        {(visited.includes('profile') || visited.includes('preferences')) && <View style={tab === 'profile' || tab === 'preferences' ? undefined : {display: 'none'}}>
          <ProfileSettings section={tab === 'preferences' ? 'preferences' : 'profile'}/>
          <View style={tab === 'profile' ? undefined : {display: 'none'}}><FinancialResetSettings/><AccountDeletionSettings/></View>
        </View>}
        {visited.includes('sources') && <View style={[styles.column, tab !== 'sources' && {display: 'none'}]}>
          <View style={pageLayout.section}><IncomeSourcesSettings/></View>
          <View style={pageLayout.section}><PaymentMethodsSettings /></View>
        </View>}
        {visited.includes('notifications') && <View style={[pageLayout.section, tab !== 'notifications' && {display: 'none'}]}>
          <NotificationSettings />
        </View>}
        <View style={[styles.columns, tab !== 'organize' && {display: 'none'}]}>
          <View style={styles.column}>
            <View style={pageLayout.section}>
              <Text accessibilityRole="header" style={styles.heading}>
                Categories
              </Text>
              <QueryState
                loading={categories.isPending}
                error={categories.isError}
                retry={() => void categories.refetch()}
              >
                <ScrollView accessibilityLabel="Categories list" style={{maxHeight: 300}} nestedScrollEnabled showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled">
                {(categories.data ?? []).map((category) => (
                  <MotionPressable
                    key={category.id}
                    style={styles.row}
                    onPress={() =>
                      router.push({
                        pathname: "/category/[id]",
                        params: {
                          id: category.id,
                          name: category.name,
                          color: category.color,
                          visit: createRequestId(),
                        },
                      })
                    }
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: category.color },
                      ]}
                    />
                    <Text style={styles.rowText}>{category.name}</Text>
                    <ChevronRight size={16} color={colors.subtle} />
                  </MotionPressable>
                ))}
                </ScrollView>
                {(categories.data ?? []).length === 0 && (
                  <Text style={styles.emptyText}>
                    No categories yet.
                  </Text>
                )}
              </QueryState>
              <MotionPressable
                style={styles.addButton}
                onPress={() => router.push("/category/new")}
              >
                <Plus size={16} color={colors.primary} />
                <Text style={styles.addButtonText}>Add Category</Text>
              </MotionPressable>
            </View>
          </View>
          <View style={styles.column}>
            <View style={pageLayout.section}>
              <Text accessibilityRole="header" style={styles.heading}>
                Bills
              </Text>
              <QueryState
                loading={recurringRules.isPending}
                error={recurringRules.isError}
                retry={() => void recurringRules.refetch()}
              >
                {(recurringRules.data ?? []).map((rule) => {
                  const category = (categories.data ?? []).find(
                    (category) => category.id === rule.category_id,
                  );
                  return (
                    <MotionPressable
                      key={rule.id}
                      style={styles.row}
                      onPress={() =>
                        router.push({
                          pathname: "/recurring/[id]",
                          params: {
                            id: rule.id,
                            visit: createRequestId(),
                            categoryId: rule.category_id,
                            amount: String(rule.amount),
                            note: rule.note ?? "",
                            frequency: rule.frequency,
                            active: String(rule.active),
                          },
                        })
                      }
                    >
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowText}>
                          {category?.name ?? "Unknown"}
                        </Text>
                        <Text style={styles.ruleDetail}>
                          {formatMoney(rule.amount)} / {rule.frequency}
                          {rule.active ? "" : " · Paused"}
                        </Text>
                      </View>
                      <ChevronRight size={16} color={colors.subtle} />
                    </MotionPressable>
                  );
                })}
                {(recurringRules.data ?? []).length === 0 && (
                  <Text style={styles.emptyText}>
                    No bills yet.
                  </Text>
                )}
              </QueryState>
              <MotionPressable
                style={styles.addButton}
                onPress={() =>
                  router.push({
                    pathname: "/recurring/new",
                    params: { visit: createRequestId() },
                  })
                }
              >
                <Plus size={16} color={colors.primary} />
                <Text style={styles.addButtonText}>Add bill</Text>
              </MotionPressable>
            </View>
            <View style={pageLayout.section}>
              <Text accessibilityRole="header" style={styles.heading}>
                Scan history
              </Text>
              <Text style={styles.description}>
                Saved receipt text.
              </Text>
              <QueryState
                loading={scans.isPending}
                error={scans.isError && !scans.data?.length}
                retry={() => void scans.refetch()}
              >
                {(scans.data ?? []).length === 0 && (
                  <Text style={styles.emptyText}>No scans yet.</Text>
                )}
                {(scans.data ?? []).map((scan) => (
                  <View key={scan.id} style={styles.row}>
                    <MotionPressable
                      style={styles.scanInfo}
                      onPress={() => openScan(scan)}
                    >
                      <FileText color={colors.primary} size={19} />
                      <View style={styles.rowInfo}>
                        <Text style={styles.rowText}>
                          {format(new Date(scan.created_at), "MMM d, h:mm a")}
                        </Text>
                        <Text style={styles.ruleDetail}>
                          {scan.char_count === null
                            ? "Receipt text"
                            : `${scan.char_count} chars`}
                        </Text>
                      </View>
                    </MotionPressable>
                    <MotionPressable
                      onPress={() => deleteScan(scan.id)}
                      accessibilityLabel="Delete scan"
                      style={styles.iconButton}
                    >
                      <Trash color={colors.danger} size={17} />
                    </MotionPressable>
                  </View>
                ))}
                {scans.isFetchNextPageError && (
                  <Text accessibilityRole="alert" style={form.error}>
                    Could not load older scans. Your loaded receipts are still
                    here; try again.
                  </Text>
                )}
                {scans.hasNextPage && (
                  <MotionPressable
                    style={[form.secondaryButton, {flexDirection: 'row', gap: 8}]}
                    disabled={scans.isFetchingNextPage}
                    onPress={() => {
                      if (!scans.isFetchingNextPage) void scans.fetchNextPage();
                    }}
                    accessibilityLabel="Load more scanned receipts"
                    accessibilityState={{
                      disabled: scans.isFetchingNextPage,
                      busy: scans.isFetchingNextPage,
                    }}
                  >
                    <ChevronDown size={18} color={colors.primary}/><Text style={form.chipTextSelected}>
                      {scans.isFetchingNextPage
                        ? "Loading more…"
                        : scans.isFetchNextPageError
                          ? "Retry load more"
                          : "Load more"}
                    </Text>
                  </MotionPressable>
                )}
                {!!scans.data?.length && !scans.hasNextPage && !scans.isFetchingNextPage && (
                  <Text style={styles.description}>All scans loaded.</Text>
                )}
              </QueryState>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
    <View style={{paddingHorizontal:24,paddingRight:96,minHeight:48,justifyContent:'center',backgroundColor:colors.background}}>
      <MotionPressable accessibilityLabel="Need help?" onPress={()=>useHelpStore.getState().open()} style={{minHeight:44,flexDirection:'row',gap:8,alignItems:'center',alignSelf:'flex-start',paddingHorizontal:8}}>
        <CircleHelp size={16} color={colors.text}/><Text style={{...type.label,color:colors.text}}>Need help?</Text>
      </MotionPressable>
    </View>
    </View>
  );
}
const useStyles = createThemedStyles((colors) => ({
  columns: { gap: 24 },
  column: { minWidth: 0, gap: 24 },
  heading: { ...type.heading, color: colors.text },
  description: {
    ...type.body,
    color: colors.muted,
    marginTop: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    minHeight: 56,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  rowText: { ...type.body, color: colors.text, flex: 1 },
  rowInfo: { flex: 1, gap: 3 },
  ruleDetail: {
    ...type.number,
    fontWeight: "400",
    fontSize: 13,
    color: colors.muted,
  },
  addButton: {
    paddingTop: 16,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addButtonText: { ...type.label, color: colors.primary },
  emptyText: { ...type.body, color: colors.muted, paddingVertical: 16 },
  scanInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  iconButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  signOutButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  signOutText: { ...type.label, color: colors.danger },
}));
