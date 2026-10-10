import { formatMoney } from "../../src/domain/money";
import { ScrollView, View, Text, Linking } from "react-native";
import { useRouter } from "expo-router";
import { format } from "date-fns";
import {
  FileText,
  Trash,
  ChevronRight,
  Plus,
  LogOut,
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

export default function SettingsScreen() {
  const router = useRouter();
  const styles = useStyles();
  const pageLayout = usePageLayout({ safeTop: true });
  const colors = useColors();
  const form = useFormStyles();
  const categories = useCategories();
  const recurringRules = useRecurringRules();
  const scans = useOcrScans();
  const { mutate: deleteScan } = useDeleteOcrScan();
  async function openScan(scan: OcrScanRow) {
    try {
      await Linking.openURL(await getOcrDownloadUrl(scan));
    } catch {
      useToastStore.getState().showToast("Couldn't open that scan.");
    }
  }
  return (
    <ScrollView
      style={pageLayout.screen}
      contentContainerStyle={pageLayout.scrollContent}
    >
      <View style={pageLayout.workspace}>
        <ScreenHeading
          title="Settings"
          description="Make your budget work for you."
        />
        <ProfileSettings />
        <View style={pageLayout.section}><IncomeSourcesSettings/></View>
        <View style={pageLayout.section}>
          <PaymentMethodsSettings />
        </View>
        <View style={pageLayout.section}>
          <NotificationSettings />
        </View>
        <View style={styles.columns}>
          <View style={styles.column}>
            <View style={pageLayout.section}>
              <Text accessibilityRole="header" style={styles.heading}>
                Categories
              </Text>
              <Text style={styles.description}>
                Organize spending in a way that makes sense to you.
              </Text>
              <QueryState
                loading={categories.isPending}
                error={categories.isError}
                retry={() => void categories.refetch()}
              >
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
                {(categories.data ?? []).length === 0 && (
                  <Text style={styles.emptyText}>
                    Add a category to organize your expenses.
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
                Recurring Bills
              </Text>
              <Text style={styles.description}>
                Keep your regular expenses on the record.
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
                    No recurring expenses yet.
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
                <Text style={styles.addButtonText}>Add Recurring Bill</Text>
              </MotionPressable>
            </View>
            <View style={pageLayout.section}>
              <Text accessibilityRole="header" style={styles.heading}>
                Scanned Receipts
              </Text>
              <Text style={styles.description}>
                Open or remove the text from your recent scans.
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
                    style={form.secondaryButton}
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
                    <Text style={form.chipTextSelected}>
                      {scans.isFetchingNextPage
                        ? "Loading more…"
                        : scans.isFetchNextPageError
                          ? "Retry load more"
                          : "Load more"}
                    </Text>
                  </MotionPressable>
                )}
              </QueryState>
            </View>
          </View>
        </View>
        <View><View style={styles.account}>
          <Text style={styles.description}>Ready to step away?</Text>
          <MotionPressable
            style={styles.signOutButton}
            onPress={() => void supabase.auth.signOut()}
          >
            <LogOut size={17} color={colors.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </MotionPressable>
        </View><AccountDeletionSettings /></View>
      </View>
    </ScrollView>
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
  account: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 24,
  },
  signOutButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  signOutText: { ...type.label, color: colors.danger },
}));
