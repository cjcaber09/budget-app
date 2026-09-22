import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { useRecurringRules } from '../../src/hooks/useRecurringRules';
import { supabase } from '../../src/lib/supabase';
import { pageLayout } from '../../src/styles/pageLayout';

export default function SettingsScreen() {
  const router = useRouter();
  const { data: categories } = useCategories();
  const { data: recurringRules } = useRecurringRules();

  return (
    <ScrollView style={styles.container} contentContainerStyle={pageLayout.scrollContent}>
      <View style={styles.column}>
        <View style={pageLayout.card}>
          <Text style={styles.heading}>Categories</Text>
          {(categories ?? []).map((category) => (
            <Pressable
              key={category.id}
              style={styles.row}
              onPress={() =>
                router.push({
                  pathname: '/category/[id]',
                  params: { id: category.id, name: category.name, color: category.color },
                })
              }
            >
              <View style={[styles.swatch, { backgroundColor: category.color }]} />
              <Text style={styles.rowText}>{category.name}</Text>
            </Pressable>
          ))}
          <Pressable style={styles.addButton} onPress={() => router.push('/category/new')}>
            <Text style={styles.addButtonText}>+ Add Category</Text>
          </Pressable>
        </View>

        <View style={pageLayout.card}>
          <Text style={styles.heading}>Recurring Rules</Text>
          {(recurringRules ?? []).map((rule) => {
            const category = (categories ?? []).find((c) => c.id === rule.category_id);
            return (
              <Pressable
                key={rule.id}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/recurring/[id]',
                    params: {
                      id: rule.id,
                      categoryId: rule.category_id,
                      amount: String(rule.amount),
                      note: rule.note ?? '',
                      frequency: rule.frequency,
                      active: String(rule.active),
                    },
                  })
                }
              >
                <Text style={styles.rowText}>
                  {category?.name ?? 'Unknown'} — ${rule.amount.toFixed(2)} / {rule.frequency}
                  {rule.active ? '' : ' (paused)'}
                </Text>
              </Pressable>
            );
          })}
          <Pressable style={styles.addButton} onPress={() => router.push('/recurring/new')}>
            <Text style={styles.addButtonText}>+ Add Recurring Rule</Text>
          </Pressable>
        </View>

        <View style={pageLayout.card}>
          <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  column: { width: '100%', maxWidth: 480, gap: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  swatch: { width: 20, height: 20, borderRadius: 10, marginRight: 12 },
  rowText: { fontSize: 16 },
  addButton: { paddingVertical: 12 },
  addButtonText: { color: '#2196F3', fontWeight: '600' },
  signOutButton: { alignItems: 'center' },
  signOutText: { color: '#D32F2F', fontWeight: '600' },
});
