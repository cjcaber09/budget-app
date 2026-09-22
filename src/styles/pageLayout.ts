import { StyleSheet } from 'react-native';

// Shared "boxed" page layout: content centered horizontally in a
// bordered/shadowed card capped at a comfortable reading width, used
// across every screen so the app looks consistent regardless of viewport.
export const pageLayout = StyleSheet.create({
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: 16 },
  card: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
  },
});
