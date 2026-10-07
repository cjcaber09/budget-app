import { useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { Check } from 'lucide-react-native';
import { MotionPressable } from './MotionPressable';
import { useFormStyles } from '../styles/forms';
import { useColors } from '../styles/theme';

const COLOR_OPTIONS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#607D8B'];

export interface CategoryFormValues {
  name: string;
  color: string;
}

interface Props {
  initialValues?: CategoryFormValues;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: CategoryFormValues) => void;
}

export function CategoryForm({ initialValues, submitLabel, submitting, onSubmit }: Props) {
  const styles = useFormStyles();
  const colors = useColors();
  const [name, setName] = useState(initialValues?.name ?? '');
  const [color, setColor] = useState(initialValues?.color ?? COLOR_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (submitting) return;
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
      <TextInput accessibilityLabel="Category name" placeholderTextColor={colors.subtle} style={styles.input} value={name} onChangeText={setName} placeholder="Category name" />
      <Text style={styles.label}>Color</Text>
      <View style={styles.optionRow}>
        {COLOR_OPTIONS.map((option) => (
          <MotionPressable
            key={option}
            onPress={() => setColor(option)}
            accessibilityLabel={`Select color ${option}`}
            accessibilityState={{ selected: color === option }}
            style={{ width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: option }}
          >{color === option && <Check size={21} color="#162A1E" strokeWidth={2.5} />}</MotionPressable>
        ))}
      </View>
      <MotionPressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? 'Saving…' : submitLabel}</Text>
      </MotionPressable>
    </View>
  );
}
