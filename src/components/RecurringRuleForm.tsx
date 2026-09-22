import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import type { Category, RecurringFrequency } from '../types/database';

export interface RecurringRuleFormValues {
  categoryId: string;
  amount: string;
  note: string;
  frequency: RecurringFrequency;
}

interface Props {
  categories: Category[];
  initialValues?: RecurringRuleFormValues;
  submitLabel: string;
  onSubmit: (values: {
    categoryId: string;
    amount: number;
    note: string | null;
    frequency: RecurringFrequency;
  }) => void;
}

export function RecurringRuleForm({ categories, initialValues, submitLabel, onSubmit }: Props) {
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(initialValues?.frequency ?? 'monthly');
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
    onSubmit({ categoryId, amount: parsedAmount, note: note.trim() ? note.trim() : null, frequency });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Category</Text>
      <View style={styles.optionRow}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={[
              styles.chip,
              { borderColor: category.color },
              categoryId === category.id && { backgroundColor: category.color },
            ]}
          >
            <Text style={categoryId === category.id ? styles.chipTextSelected : styles.chipText}>
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Amount</Text>
      <TextInput style={styles.input} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput style={styles.input} value={note} onChangeText={setNote} placeholder="Note" />
      <Text style={styles.label}>Frequency</Text>
      <View style={styles.optionRow}>
        {(['weekly', 'monthly'] as RecurringFrequency[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setFrequency(option)}
            style={[styles.chip, frequency === option && styles.chipSelected]}
          >
            <Text style={frequency === option ? styles.chipTextSelected : styles.chipText}>
              {option === 'weekly' ? 'Weekly' : 'Monthly'}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable style={styles.button} onPress={handleSubmit}>
        <Text style={styles.buttonText}>{submitLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  label: { fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12 },
  chipSelected: { backgroundColor: '#2196F3', borderColor: '#2196F3' },
  chipText: { color: '#333' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
