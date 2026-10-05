import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { Category, TransactionType } from '../types/database';

export interface TransactionFormValues {
  type: TransactionType;
  categoryId: string;
  amount: string;
  note: string;
}

interface Props {
  categories: Category[];
  initialValues?: Partial<TransactionFormValues>;
  submitLabel: string;
  onSubmit: (values: {
    type: TransactionType;
    categoryId: string | null;
    amount: number;
    note: string | null;
  }) => void;
}

const TYPE_OPTIONS: TransactionType[] = ['expense', 'income'];

export function TransactionForm({ categories, initialValues, submitLabel, onSubmit }: Props) {
  const [type, setType] = useState<TransactionType>(initialValues?.type ?? 'expense');
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    const parsedAmount = Number(amount);

    if (type === 'expense' && !categoryId) {
      setError('Please choose a category');
      return;
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a number greater than 0');
      return;
    }

    setError(null);
    onSubmit({
      type,
      categoryId: type === 'expense' ? categoryId : null,
      amount: parsedAmount,
      note: note.trim() ? note.trim() : null,
    });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Type</Text>
      <View style={styles.categoryRow}>
        {TYPE_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setType(option)}
            style={[styles.typeChip, type === option && styles.typeChipSelected]}
          >
            <Text style={type === option ? styles.categoryChipTextSelected : styles.categoryChipText}>
              {option === 'expense' ? 'Expense' : 'Income'}
            </Text>
          </Pressable>
        ))}
      </View>
      {type === 'expense' && (
        <>
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
        </>
      )}
      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput
        style={[styles.input, styles.noteInput]}
        value={note}
        onChangeText={setNote}
        placeholder="Note"
        multiline
      />
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
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { borderWidth: 1, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  categoryChipText: { color: '#333' },
  categoryChipTextSelected: { color: '#fff', fontWeight: '600' },
  typeChip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  typeChipSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
