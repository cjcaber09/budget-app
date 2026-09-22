import { useLocalSearchParams, useRouter } from 'expo-router';
import { CategoryForm } from '../../src/components/CategoryForm';
import { useUpdateCategory } from '../../src/hooks/useCategories';

export default function EditCategoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string; color: string }>();
  const { mutate: updateCategory } = useUpdateCategory();

  return (
    <CategoryForm
      initialValues={{ name: params.name, color: params.color }}
      submitLabel="Save Changes"
      onSubmit={(values) => updateCategory({ id: params.id, ...values }, { onSuccess: () => router.back() })}
    />
  );
}
