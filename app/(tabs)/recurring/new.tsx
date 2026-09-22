import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddRecurringRule } from '../../../src/hooks/useRecurringRules';
import { RecurringRuleForm } from '../../../src/components/RecurringRuleForm';

export default function NewRecurringRuleScreen() {
  const router = useRouter();
  const { data: categories } = useCategories();
  const { mutate: addRecurringRule } = useAddRecurringRule();

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <RecurringRuleForm
      categories={categories}
      submitLabel="Add Recurring Rule"
      onSubmit={(values) => addRecurringRule(values, { onSuccess: () => router.back() })}
    />
  );
}
