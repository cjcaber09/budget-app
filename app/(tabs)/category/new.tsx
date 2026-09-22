import { View, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { CategoryForm } from '../../../src/components/CategoryForm';
import { useAddCategory } from '../../../src/hooks/useCategories';
import { pageLayout } from '../../../src/styles/pageLayout';

export default function NewCategoryScreen() {
  const router = useRouter();
  const { mutate: addCategory } = useAddCategory();

  return (
    <ScrollView contentContainerStyle={pageLayout.scrollContent}>
      <View style={pageLayout.card}>
        <CategoryForm
          submitLabel="Add Category"
          onSubmit={(values) => addCategory(values, { onSuccess: () => router.back() })}
        />
      </View>
    </ScrollView>
  );
}
