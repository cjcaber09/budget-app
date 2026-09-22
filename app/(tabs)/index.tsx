import { View, ScrollView, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useCategories } from "../../src/hooks/useCategories";
import { useBudgets } from "../../src/hooks/useBudgets";
import { useTransactions } from "../../src/hooks/useTransactions";
import { useUiStore } from "../../src/stores/useUiStore";
import {
  sumTransactionsForCategory,
  computeBudgetStatus,
} from "../../src/domain/budgetMath";
import { CategoryProgressBar } from "../../src/components/CategoryProgressBar";
import { AlertBanner } from "../../src/components/AlertBanner";
import { pageLayout } from "../../src/styles/pageLayout";

export default function OverviewScreen() {
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(selectedMonth);
  const { data: transactions } = useTransactions(selectedMonth);

  const rows = (categories ?? []).map((category) => {
    const budget = (budgets ?? []).find((b) => b.category_id === category.id);
    const spent = sumTransactionsForCategory(transactions ?? [], category.id);
    const status = computeBudgetStatus(budget?.amount ?? 0, spent);
    return { category, status };
  });

  const overBudgetRows = rows.filter((row) => row.status.status === "over");

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={pageLayout.scrollContent}>
        <View style={pageLayout.card}>
          {overBudgetRows.map((row) => (
            <AlertBanner
              key={row.category.id}
              message={`${row.category.name} is over budget`}
            />
          ))}
          {/* `/budget/[id]` and `/transaction/new` don't exist as route files yet
              (added in Tasks 23/21), so expo-router's generated typed-routes
              union doesn't include them yet. These casts are safe now and
              become redundant (not incorrect) once those routes land. */}
          {rows.map((row) => (
            <Pressable
              key={row.category.id}
              onPress={() => router.push(`/budget/${row.category.id}` as Href)}
            >
              <CategoryProgressBar
                categoryName={row.category.name}
                status={row.status}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <Pressable
        style={styles.fab}
        onPress={() => router.push("/transaction/new" as Href)}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const FAB_SIZE = 56;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  fab: {
    position: "absolute",
    left: "50%",
    marginLeft: -FAB_SIZE / 2,
    // Half the button sits above the tab bar (in the content area), half
    // below it (over the tab bar itself), straddling the boundary.
    bottom: -FAB_SIZE / 2,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: "#2196F3",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 12px rgba(33, 150, 243, 0.45)",
    elevation: 8,
    zIndex: 20,
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 30 },
});
