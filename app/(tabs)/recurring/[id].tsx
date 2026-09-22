import { View, ScrollView, ActivityIndicator, Pressable, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useUpdateRecurringRule, useSetRecurringRuleActive } from '../../../src/hooks/useRecurringRules';
import { RecurringRuleForm } from '../../../src/components/RecurringRuleForm';
import type { RecurringFrequency } from '../../../src/types/database';
import { pageLayout } from '../../../src/styles/pageLayout';

export default function EditRecurringRuleScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    categoryId: string;
    amount: string;
    note: string;
    frequency: RecurringFrequency;
    active: string;
  }>();
  const { data: categories } = useCategories();
  const { mutate: updateRecurringRule } = useUpdateRecurringRule();
  const { mutate: setActive } = useSetRecurringRuleActive();

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const isActive = params.active === 'true';

  return (
    <ScrollView contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <RecurringRuleForm
          categories={categories}
          initialValues={{
            categoryId: params.categoryId,
            amount: params.amount,
            note: params.note,
            frequency: params.frequency,
          }}
          submitLabel="Save Changes"
          onSubmit={(values) => updateRecurringRule({ id: params.id, ...values }, { onSuccess: () => router.back() })}
        />
        <Pressable
          style={styles.toggleButton}
          onPress={() => setActive({ id: params.id, active: !isActive }, { onSuccess: () => router.back() })}
        >
          <Text style={styles.toggleText}>{isActive ? 'Pause Rule' : 'Resume Rule'}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  toggleButton: { padding: 16, alignItems: 'center' },
  toggleText: { color: '#D32F2F', fontWeight: '600' },
});
