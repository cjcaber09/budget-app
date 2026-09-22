import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { Category } from '../types/database';

export interface TransactionFormValues {
  categoryId: string;
  amount: string;
  note: string;
}

interface Props {
  categories: Category[];
  initialValues?: TransactionFormValues;
  submitLabel: string;
  onSubmit: (values: { categoryId: string; amount: number; note: string | null }) => void;
}

export function TransactionForm({ categories, initialValues, submitLabel, onSubmit }: Props) {
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const parsedAmount = Number(amount);

    if (!categoryId) {
      setError('Please choose a category');
      return;
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a number greater than 0');
      return;
    }

    setError(null);
    onSubmit({ categoryId, amount: parsedAmount, note: note.trim() ? note.trim() : null });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Category</Text>
      <View style={styles.categoryRow}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={[
              styles.categoryChip,
              { borderColor: category.color },
              categoryId === category.id && { backgroundColor: category.color },
            ]}
          >
            <Text style={categoryId === category.id ? styles.categoryChipTextSelected : styles.categoryChipText}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" />
      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: { fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  categoryChipText: { color: '#333' },
  categoryChipTextSelected: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
