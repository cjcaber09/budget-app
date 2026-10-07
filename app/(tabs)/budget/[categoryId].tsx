import { useState } from 'react';
import { View, ScrollView, Text, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useBudgets, useSetBudget } from '../../../src/hooks/useBudgets';
import { useUiStore } from '../../../src/stores/useUiStore';
import { MotionPressable } from '../../../src/components/MotionPressable';
import { useFormStyles } from '../../../src/styles/forms';
import { useColors } from '../../../src/styles/theme';
import { usePageLayout } from '../../../src/styles/pageLayout';

export default function EditBudgetScreen() {
  const pageLayout = usePageLayout();
  const styles = useFormStyles();
  const colors = useColors();
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const router = useRouter();
  const selectedMonth = useUiStore((state) => state.selectedMonth);
  const { data: categories } = useCategories();
  const { data: budgets } = useBudgets(selectedMonth);
  const { mutate: setBudget } = useSetBudget();

  const category = (categories ?? []).find((c) => c.id === categoryId);
  const existingBudget = (budgets ?? []).find((b) => b.category_id === categoryId);
  const [amount, setAmount] = useState(existingBudget ? String(existingBudget.amount) : '');
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    const parsedAmount = Number(amount);
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount < 0) {
      setError('Budget must be a number of 0 or more');
      return;
    }
    setError(null);
    setBudget(
      { categoryId, month: selectedMonth, amount: parsedAmount },
      { onSuccess: () => router.back() }
    );
  }

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <Text style={styles.title}>{category?.name ?? 'Category'} Budget</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        <TextInput accessibilityLabel="Budget amount" placeholderTextColor={colors.subtle} style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
        <MotionPressable style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Save Budget</Text>
        </MotionPressable>
      </View>
    </ScrollView>
  );
}
