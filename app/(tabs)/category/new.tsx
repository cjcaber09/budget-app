import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { CategoryForm } from '../../../src/components/CategoryForm';
import { useAddCategory } from '../../../src/hooks/useCategories';
import { usePageLayout } from '../../../src/styles/pageLayout';

export default function NewCategoryScreen() {
  const pageLayout = usePageLayout();
  const router = useRouter();
  const { mutate: addCategory, isPending: submitting } = useAddCategory();

  return (
    <ScrollView style={pageLayout.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <CategoryForm
          submitting={submitting} submitLabel="Add Category"
          onSubmit={(values) => addCategory(values, { onSuccess: () => router.back() })}
        />
      </View>
    </ScrollView>
  );
}
