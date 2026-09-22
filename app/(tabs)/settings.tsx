import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useCategories } from '../../src/hooks/useCategories';
import { supabase } from '../../src/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  const { data: categories } = useCategories();

  return (
    <ScrollView style={styles.container}>
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

      <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  heading: { fontSize: 18, fontWeight: '700', marginTop: 24, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  swatch: { width: 20, height: 20, borderRadius: 10, marginRight: 12 },
  rowText: { fontSize: 16 },
  addButton: { paddingVertical: 12 },
  addButtonText: { color: '#2196F3', fontWeight: '600' },
  signOutButton: { marginTop: 32, padding: 14, alignItems: 'center' },
  signOutText: { color: '#D32F2F', fontWeight: '600' },
});
