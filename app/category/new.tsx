import { useRouter } from 'expo-router';
import { CategoryForm } from '../../src/components/CategoryForm';
import { useAddCategory } from '../../src/hooks/useCategories';

export default function NewCategoryScreen() {
  const router = useRouter();
  const { mutate: addCategory } = useAddCategory();

  return (
    <CategoryForm
      submitLabel="Add Category"
      onSubmit={(values) => addCategory(values, { onSuccess: () => router.back() })}
    />
  );
}
