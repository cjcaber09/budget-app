import {PaymentMethodPicker} from '../../../src/components/PaymentMethodPicker';
import { View, ScrollView, ActivityIndicator, Text } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCategories } from '../../../src/hooks/useCategories';
import { useUpdateRecurringRule, useSetRecurringRuleActive,useRecurringRule,useArchiveRecurringRule } from '../../../src/hooks/useRecurringRules';
import { RecurringRuleForm } from '../../../src/components/RecurringRuleForm';
import type { RecurringFrequency } from '../../../src/types/database';
import { MotionPressable } from '../../../src/components/MotionPressable';
import { useFormStyles } from '../../../src/styles/forms';
import { usePageLayout } from '../../../src/styles/pageLayout';

export default function EditRecurringRuleScreen() {
  const pageLayout = usePageLayout();
  const styles = useFormStyles();
  const router = useRouter();
  const params = useLocalSearchParams<{
    id: string;
    categoryId: string;
    amount: string;
    note: string;
    frequency: RecurringFrequency;
    active: string;
    visit?:string;
  }>();
  const rule=useRecurringRule(params.id);const archive=useArchiveRecurringRule();
  const { data: categories } = useCategories();
  const { mutate: updateRecurringRule, isPending: submitting } = useUpdateRecurringRule();
  const { mutate: setActive } = useSetRecurringRuleActive();

  if (!categories || !rule.data) {
    return (
      <View style={{ flex: 1, justifyContent: 'center' }}>
        {rule.isError ? <MotionPressable onPress={()=>void rule.refetch()}><Text style={styles.secondaryText}>Could not load the bill. Retry</Text></MotionPressable> : <ActivityIndicator />}
      </View>
    );
  }

  const isActive = rule.data.active;

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <RecurringRuleForm paymentMethodControl={(value,onChange)=><PaymentMethodPicker value={value} onChange={onChange}/>}
          key={`${rule.data.id}:${params.visit??''}`}
          categories={categories}
          initialValues={{
            paymentMethodId:rule.data.payment_method_id??null,
            categoryId: rule.data.category_id,
            amount: String(rule.data.amount),
            note: rule.data.note??'',
            frequency: rule.data.frequency,
            nextDueDate:rule.data.next_occurrence_date,
            monthEnd:rule.data.month_end,
            reminderEnabled:rule.data.reminder_enabled,
            reminderDaysBefore:rule.data.reminder_days_before,
            reminderTime:rule.data.reminder_time,
          }}
          submitting={submitting} submitLabel="Save Changes"
          onSubmit={(values) => updateRecurringRule({ id: params.id, ...values }, { onSuccess: () => router.back() })}
        />
        <MotionPressable
          style={styles.secondaryButton}
          onPress={() => setActive({ id: params.id, active: !isActive }, { onSuccess: () => router.back() })}
        >
          <Text style={styles.secondaryText}>{isActive ? 'Pause Bill' : 'Resume Bill'}</Text>
        </MotionPressable>
        <MotionPressable style={styles.secondaryButton} disabled={archive.isPending} onPress={()=>archive.mutate(params.id,{onSuccess:()=>router.back()})}><Text style={styles.secondaryText}>Archive bill</Text></MotionPressable>
      </View>
    </ScrollView>
  );
}
