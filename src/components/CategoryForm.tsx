import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';

const COLOR_OPTIONS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#607D8B'];

export interface CategoryFormValues {
  name: string;
  color: string;
}

interface Props {
  initialValues?: CategoryFormValues;
  submitLabel: string;
  onSubmit: (values: CategoryFormValues) => void;
}

export function CategoryForm({ initialValues, submitLabel, onSubmit }: Props) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [color, setColor] = useState(initialValues?.color ?? COLOR_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    onSubmit({ name: name.trim(), color });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Category name" />
      <Text style={styles.label}>Color</Text>
      <View style={styles.colorRow}>
        {COLOR_OPTIONS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setColor(option)}
            style={[styles.swatch, { backgroundColor: option }, color === option && styles.swatchSelected]}
          />
        ))}
      </View>
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
  colorRow: { flexDirection: 'row', gap: 10 },
  swatch: { width: 32, height: 32, borderRadius: 16 },
  swatchSelected: { borderWidth: 3, borderColor: '#000' },
  button: { backgroundColor: '#2196F3', borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 20 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#D32F2F', marginBottom: 12 },
});
