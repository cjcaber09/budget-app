import { useState } from 'react';
import { View, ScrollView, Text } from 'react-native';
import { Trash2, X } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CategoryForm } from '../../../src/components/CategoryForm';
import { useUpdateCategory, useDeleteCategory } from '../../../src/hooks/useCategories';
import { usePageLayout } from '../../../src/styles/pageLayout';
import { useFormStyles } from '../../../src/styles/forms';
import { useColors } from '../../../src/styles/theme';
import { MotionPressable } from '../../../src/components/MotionPressable';

export default function EditCategoryScreen() {
  const params = useLocalSearchParams<{ id: string; name: string; color: string; visit?: string }>();
  return <EditCategoryContent key={`${params.id}:${params.visit ?? ''}`} />;
}

function EditCategoryContent() {
  const pageLayout = usePageLayout();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string; color: string }>();
  const { mutate: updateCategory, isPending: submitting } = useUpdateCategory();
  const deletion = useDeleteCategory();
  const [confirming, setConfirming] = useState(false);
  const styles = useFormStyles(), colors = useColors();

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <CategoryForm
          initialValues={{ name: params.name, color: params.color }}
          submitting={submitting || deletion.isPending} submitLabel="Save Changes"
          secondaryAction={<MotionPressable accessibilityLabel="Delete category"
            style={[styles.secondaryButton, {flex: 1, marginTop: 0, paddingHorizontal: 10, flexDirection: 'row', gap: 8}]}
            disabled={submitting || deletion.isPending} onPress={() => setConfirming(true)}>
            <Trash2 size={18} color={colors.danger}/><Text style={styles.secondaryText}>Delete category</Text>
          </MotionPressable>}
          onSubmit={(values) => updateCategory({ id: params.id, ...values }, { onSuccess: () => router.back() })}
        />
        {deletion.isError && <Text accessibilityRole="alert" style={styles.error}>{deletion.error.message}</Text>}
        {confirming ? <View>
          <Text style={styles.subtitle}>Delete this category and its budgets? Categories used by transactions or bills must be reassigned first.</Text>
          <MotionPressable style={[styles.secondaryButton, {flexDirection: 'row', gap: 8}]} disabled={submitting || deletion.isPending}
            onPress={() => deletion.mutate(params.id, {onSuccess: () => router.back()})}>
            <Trash2 size={18} color={colors.danger}/><Text style={styles.secondaryText}>{deletion.isPending ? 'Deleting…' : 'Confirm delete'}</Text>
          </MotionPressable>
          <MotionPressable style={[styles.secondaryButton, {flexDirection: 'row', gap: 8}]} disabled={deletion.isPending} onPress={() => setConfirming(false)}>
            <X size={18} color={colors.primary}/><Text style={styles.chipTextSelected}>Cancel</Text>
          </MotionPressable>
        </View> : null}
      </View>
    </ScrollView>
  );
}
