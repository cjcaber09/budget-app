import {PaymentMethodPicker} from '../../../src/components/PaymentMethodPicker';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useAddRecurringRule } from '../../../src/hooks/useRecurringRules';
import { RecurringRuleForm } from '../../../src/components/RecurringRuleForm';
import { usePageLayout } from '../../../src/styles/pageLayout';

export default function NewRecurringRuleScreen() {
  const pageLayout = usePageLayout();
  const router = useRouter();
  const {visit}=useLocalSearchParams<{visit?:string}>();
  const { data: categories } = useCategories();
  const { mutate: addRecurringRule, isPending: submitting } = useAddRecurringRule();

  if (!categories) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <RecurringRuleForm paymentMethodControl={(value,onChange)=><PaymentMethodPicker value={value} onChange={onChange}/>}
          key={visit??'direct'}
          categories={categories}
          submitting={submitting} submitLabel="Add Recurring Bill"
          onSubmit={(values) => addRecurringRule(values, { onSuccess: () => router.back() })}
        />
      </View>
    </ScrollView>
  );
}
