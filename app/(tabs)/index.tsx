import { View, ScrollView, Text, Pressable, StyleSheet } from "react-native";
import { useRouter, type Href } from "expo-router";
import { useCategories } from "../../src/hooks/useCategories";
import { useBudgets } from "../../src/hooks/useBudgets";
import { useTransactions } from "../../src/hooks/useTransactions";
import { useUiStore } from "../../src/stores/useUiStore";
import {
  sumTransactionsForCategory,
  sumTransactionsByType,
  computeBudgetStatus,
} from "../../src/domain/budgetMath";
import { CategoryBudgetRow } from "../../src/components/CategoryBudgetRow";
import { AlertBanner } from "../../src/components/AlertBanner";
import { SpendByCategoryChart } from "../../src/components/SpendByCategoryChart";
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
  const income = sumTransactionsByType(transactions ?? [], "income");
  const expenses = sumTransactionsByType(transactions ?? [], "expense");

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.container} contentContainerStyle={pageLayout.scrollContent}>
        <View style={pageLayout.card}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>Income</Text>
              <Text style={[styles.summaryAmount, styles.incomeAmount]}>
                ${income.toFixed(2)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryTile}>
              <Text style={styles.summaryLabel}>Expenses</Text>
              <Text style={styles.summaryAmount}>${expenses.toFixed(2)}</Text>
            </View>
          </View>

          {overBudgetRows.map((row) => (
            <AlertBanner
              key={row.category.id}
              message={`${row.category.name} is over budget`}
            />
          ))}

          <Text style={styles.sectionHeading}>Expenses by Category</Text>
          <SpendByCategoryChart categories={categories ?? []} transactions={transactions ?? []} />

          {/* `/budget/[id]` and `/transaction/new` don't exist as route files yet
              (added in Tasks 23/21), so expo-router's generated typed-routes
              union doesn't include them yet. These casts are safe now and
              become redundant (not incorrect) once those routes land. */}
          <Text style={styles.sectionHeading}>Budgets</Text>
          {rows.map((row) => (
            <Pressable
              key={row.category.id}
              onPress={() => router.push(`/budget/${row.category.id}` as Href)}
            >
              <CategoryBudgetRow
                categoryName={row.category.name}
                categoryColor={row.category.color}
                status={row.status}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  summaryTile: { flex: 1, alignItems: "center" },
  summaryDivider: { width: StyleSheet.hairlineWidth, height: 36, backgroundColor: "#ddd" },
  summaryLabel: { color: "#666", fontSize: 13, marginBottom: 2 },
  summaryAmount: { fontSize: 20, fontWeight: "700" },
  incomeAmount: { color: "#2E7D32" },
  sectionHeading: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
});
