import { useContext, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import Animated, { useReducedMotion } from 'react-native-reanimated';
import { Camera, ImageUp, PenLine, ChevronRight, X } from 'lucide-react-native';
import { createThemedStyles, type, useColors, motion } from '../styles/theme';
import { MotionPressable } from './MotionPressable';

interface Props {
  visible: boolean; onClose: () => void; onDismiss?: () => void;
  onTakePhoto: () => void; onUploadImage: () => void; onManualEntry: () => void;
}
export function AddTransactionSheet({ visible, onClose, onDismiss, onTakePhoto, onUploadImage, onManualEntry }: Props) {
  const styles = useStyles();
  const colors = useColors();
  const reduced = useReducedMotion();
  const insets = useContext(SafeAreaInsetsContext);
  const [rendered, setRendered] = useState(false);
  const open = visible && (reduced || rendered);
  useEffect(() => {
    if (visible) return;
    // Keep the modal alive for its exit; native onDismiss still gates iOS pickers.
    const timer = setTimeout(() => setRendered(false), reduced ? 0 : motion.exit);
    return () => clearTimeout(timer);
  }, [visible, reduced]);
  const options = [
    { label: 'Take Photo', detail: 'Read the text from a receipt.', Icon: Camera, action: onTakePhoto },
    { label: 'Upload Image', detail: 'Choose a receipt from your library.', Icon: ImageUp, action: onUploadImage },
    { label: 'Manual Entry', detail: 'Add the details yourself.', Icon: PenLine, action: onManualEntry },
  ];
  return <Modal visible={visible || rendered} onShow={() => setRendered(true)} transparent animationType="none" onRequestClose={onClose} onDismiss={onDismiss}>
    <View style={styles.modal}>
      <Animated.View style={[styles.scrim, { opacity: open ? 1 : 0, transitionProperty: 'opacity', transitionDuration: open ? motion.enter : motion.exit, transitionTimingFunction: motion.easeOut }]} />
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" />
      <Animated.View accessibilityViewIsModal style={[styles.sheet, { opacity: open ? 1 : 0, transform: [{ translateY: reduced || open ? 0 : 32 }], transitionProperty: ['transform', 'opacity'], transitionDuration: reduced ? 0 : open ? motion.enter : motion.exit, transitionTimingFunction: motion.easeSheet }]}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, paddingBottom: 24 + (insets?.bottom ?? 0) }}>
          <View style={styles.header}><View style={styles.headerText}><Text accessibilityRole="header" style={styles.title}>Add Transaction</Text><Text style={styles.subtitle}>How would you like to add it?</Text></View><MotionPressable onPress={onClose} accessibilityLabel="Close add transaction" style={styles.close}><X size={20} color={colors.muted} /></MotionPressable></View>
          {options.map(({ label, detail, Icon, action }) => <MotionPressable key={label} style={styles.option} onPress={action}><Icon color={colors.primary} size={22} strokeWidth={1.7} /><View style={styles.optionCopy}><Text style={styles.optionText}>{label}</Text><Text style={styles.optionDetail}>{detail}</Text></View><ChevronRight size={17} color={colors.subtle} /></MotionPressable>)}
          <Text style={styles.privacy}>Photos are sent to Google to read the text (Gemini, with Cloud Vision as a backup — Gemini&apos;s free tier may use them to improve Google&apos;s products). This app doesn&apos;t keep them.</Text>
          <MotionPressable style={styles.cancelButton} onPress={onClose}><Text style={styles.cancelText}>Cancel</Text></MotionPressable>
        </ScrollView>
      </Animated.View>
    </View>
  </Modal>;
}
const useStyles = createThemedStyles(colors => ({
  modal: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' }, scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 24 }, headerText: { flex: 1 }, title: { ...type.heading, color: colors.text }, subtitle: { ...type.body, color: colors.muted, marginTop: 4 }, close: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 18, minHeight: 72, borderBottomWidth: 1, borderBottomColor: colors.border }, optionCopy: { flex: 1, gap: 4 }, optionText: { ...type.body, fontWeight: '600', color: colors.text }, optionDetail: { ...type.label, fontWeight: '400', color: colors.muted },
  privacy: { ...type.label, fontWeight: '400', fontSize: 12, color: colors.muted, marginTop: 24 },
  cancelButton: { marginTop: 16, paddingVertical: 14, minHeight: 48, alignItems: 'center', backgroundColor: colors.surfaceAlt, borderRadius: 8 }, cancelText: { ...type.label, color: colors.text },
}));
