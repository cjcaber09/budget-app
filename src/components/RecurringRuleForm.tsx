import { useState } from 'react';
import { MotionPressable } from './MotionPressable';
import { useFormStyles } from '../styles/forms';
import { useColors } from '../styles/theme';
import { View, Text, TextInput, Switch } from 'react-native';
import { TransactionDateField } from './TransactionDateField';
import { localDateKey } from '../domain/transactionDates';
import { isCalendarDate } from '../../supabase/functions/ocr/shared';
import type { Category, RecurringFrequency } from '../types/database';

export interface RecurringRuleFormValues {
  nextDueDate?:string;
  monthEnd?:boolean;
  categoryId: string;
  amount: string;
  note: string;
  frequency: RecurringFrequency;
}

interface Props {
  categories: Category[];
  initialValues?: RecurringRuleFormValues;
  submitLabel: string;
  submitting?: boolean;
  onSubmit: (values: {
    categoryId: string;
    amount: number;
    note: string | null;
    frequency: RecurringFrequency;
    nextDueDate:string;
    monthEnd:boolean;
  }) => void;
}

export function RecurringRuleForm({ categories, initialValues, submitLabel, submitting, onSubmit }: Props) {
  const styles = useFormStyles();
  const colors = useColors();
  const [categoryId, setCategoryId] = useState(initialValues?.categoryId ?? categories[0]?.id ?? '');
  const [amount, setAmount] = useState(initialValues?.amount ?? '');
  const [note, setNote] = useState(initialValues?.note ?? '');
  const [frequency, setFrequency] = useState<RecurringFrequency>(initialValues?.frequency ?? 'monthly');
  const [error, setError] = useState<string | null>(null);
  const [nextDueDate,setNextDueDate]=useState(initialValues?.nextDueDate??localDateKey(new Date()));
  const [monthEnd,setMonthEnd]=useState(initialValues?.monthEnd??false);

  function handleSubmit() {
    if (submitting) return;
    const parsedAmount = Number(amount);
    if (!categoryId) {
      setError('Please choose a category');
      return;
    }
    if(!isCalendarDate(nextDueDate)){setError('Choose a valid next due date');return;}
    if (!amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Amount must be a number greater than 0');
      return;
    }
    setError(null);
    onSubmit({ categoryId, amount: parsedAmount, note: note.trim() ? note.trim() : null, frequency,nextDueDate,monthEnd });
  }

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Category</Text>
      <View style={styles.optionRow}>
        {categories.map((category) => (
          <MotionPressable
            key={category.id} accessibilityState={{ selected: categoryId === category.id }}
            onPress={() => setCategoryId(category.id)}
            style={[
              styles.chip,

              categoryId === category.id && styles.chipSelected,
            ]}
          >
            <Text style={categoryId === category.id ? styles.chipTextSelected : styles.chipText}>
              {category.name}
            </Text>
          </MotionPressable>
        ))}
      </View>
      <Text style={styles.label}>Amount</Text>
      <TextInput placeholderTextColor={colors.subtle} style={styles.input} accessibilityLabel="Amount" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="0.00" />
      <Text style={styles.label}>Note (optional)</Text>
      <TextInput placeholderTextColor={colors.subtle} style={styles.input} value={note} onChangeText={setNote} accessibilityLabel="Note" placeholder="What was it for?" />
      <TransactionDateField value={nextDueDate} onChange={setNextDueDate} hint="Next due date. Due expenses are recorded automatically when you open the app." />
      {frequency==='monthly' && <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:16}}><Text style={styles.label}>Last day of each month</Text><Switch accessibilityLabel="Month-end schedule" value={monthEnd} onValueChange={setMonthEnd}/></View>}
      <Text style={styles.label}>Frequency</Text>
      <View style={styles.optionRow}>
        {(['weekly', 'monthly'] as RecurringFrequency[]).map((option) => (
          <MotionPressable
            key={option} accessibilityState={{ selected: frequency === option }}
            onPress={() => setFrequency(option)}
            style={[styles.chip, frequency === option && styles.chipSelected]}
          >
            <Text style={frequency === option ? styles.chipTextSelected : styles.chipText}>
              {option === 'weekly' ? 'Weekly' : 'Monthly'}
            </Text>
          </MotionPressable>
        ))}
      </View>
      <MotionPressable style={styles.button} onPress={handleSubmit} disabled={submitting}>
        <Text style={styles.buttonText}>{submitting ? 'Saving…' : submitLabel}</Text>
      </MotionPressable>
    </View>
  );
}
