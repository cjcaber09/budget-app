import { createThemedStyles, type } from './theme';

export const useFormStyles = createThemedStyles(colors => ({
  container: { gap: 0 },
  title: { ...type.heading, color: colors.text, marginBottom: 8 },
  subtitle: { ...type.body, color: colors.muted, marginBottom: 12 },
  label: { ...type.label, color: colors.text, marginTop: 24, marginBottom: 8 },
  input: { ...type.body, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50 },
  noteInput: { minHeight: 112, textAlignVertical: 'top' },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, minHeight: 48, justifyContent: 'center' },
  chipSelected: { backgroundColor: colors.selected, borderColor: colors.primary },
  chipText: { ...type.label, color: colors.muted },
  chipTextSelected: { ...type.label, color: colors.primary },
  button: { backgroundColor: colors.primary, borderRadius: 10, padding: 16, minHeight: 52, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  buttonText: { ...type.body, color: colors.onPrimary, fontWeight: '600' },
  error: { ...type.body, color: colors.danger, backgroundColor: colors.dangerBg, padding: 12, borderRadius: 8, marginBottom: 12 },
  secondaryButton: { padding: 16, alignItems: 'center', minHeight: 48, marginTop: 12, borderWidth:1,borderColor:colors.border,borderRadius:10,backgroundColor:colors.surface },
  secondaryText: { ...type.label, color: colors.danger },
}));
