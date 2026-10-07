import { View, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CategoryForm } from '../../../src/components/CategoryForm';
import { useUpdateCategory } from '../../../src/hooks/useCategories';
import { usePageLayout } from '../../../src/styles/pageLayout';

export default function EditCategoryScreen() {
  const pageLayout = usePageLayout();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string; color: string }>();
  const { mutate: updateCategory, isPending: submitting } = useUpdateCategory();

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <CategoryForm
          initialValues={{ name: params.name, color: params.color }}
          submitting={submitting} submitLabel="Save Changes"
          onSubmit={(values) => updateCategory({ id: params.id, ...values }, { onSuccess: () => router.back() })}
        />
      </View>
    </ScrollView>
  );
}
