import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { Camera, ImageUp, PenLine } from 'lucide-react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  onTakePhoto: () => void;
  onUploadImage: () => void;
  onManualEntry: () => void;
}

export function AddTransactionSheet({
  visible,
  onClose,
  onDismiss,
  onTakePhoto,
  onUploadImage,
  onManualEntry,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} onDismiss={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add Transaction</Text>
          <Pressable style={styles.option} onPress={onTakePhoto}>
            <Camera color="#2196F3" size={22} />
            <Text style={styles.optionText}>Take Photo</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={onUploadImage}>
            <ImageUp color="#2196F3" size={22} />
            <Text style={styles.optionText}>Upload Image</Text>
          </Pressable>
          <Pressable style={styles.option} onPress={onManualEntry}>
            <PenLine color="#2196F3" size={22} />
            <Text style={styles.optionText}>Manual Entry</Text>
          </Pressable>
          <Text style={styles.privacy}>
            Photos are sent to Google Cloud Vision to read the text and are not stored.
          </Text>
          <Pressable style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 32,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 12, textAlign: 'center', color: '#666' },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  optionText: { fontSize: 17, fontWeight: '600' },
  privacy: { marginTop: 12, fontSize: 12, color: '#888', textAlign: 'center' },
  cancelButton: { marginTop: 8, paddingVertical: 14, alignItems: 'center' },
  cancelText: { fontSize: 16, fontWeight: '600', color: '#D32F2F' },
});
