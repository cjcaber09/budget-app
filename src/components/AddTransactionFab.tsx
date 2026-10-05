import { useRef, useState } from 'react';
import { Platform, Pressable, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { TAB_BAR_HEIGHT } from '../constants/layout';
import { AddTransactionSheet } from './AddTransactionSheet';
import { useToastStore } from '../stores/useToastStore';
import { useScanStore } from '../stores/useScanStore';
import { prepareScanImage } from '../lib/prepareScanImage';
import { estimateBase64Bytes, createRequestId } from '../domain/ocr';
import { MAX_IMAGE_BYTES } from '../../supabase/functions/ocr/shared';

const FAB_SIZE = 56;

type ImageSource = 'camera' | 'library';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// On desktop web, the camera picker falls back to a file dialog.
async function pickImage(source: ImageSource) {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'] };
  if (source === 'library') return ImagePicker.launchImageLibraryAsync(options);

  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    showToast('Camera access is needed to scan a receipt.');
    return null;
  }
  return ImagePicker.launchCameraAsync(options);
}

export function AddTransactionFab() {
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const afterSheetClosesRef = useRef<(() => void) | null>(null);

  // iOS can't present the camera/library while the sheet's Modal is still
  // animating closed — the picker silently never appears. There, wait for the
  // Modal's onDismiss (iOS-only on native), with a timeout fallback so a missed
  // onDismiss can't swallow the tap. Android and web open immediately, which
  // also keeps web inside the click's user-activation window.
  function closeSheetThen(action: () => void) {
    setSheetOpen(false);
    if (Platform.OS !== 'ios') {
      action();
      return;
    }
    afterSheetClosesRef.current = action;
    setTimeout(handleSheetDismiss, 800);
  }

  // Runs at most once per tap: whichever of onDismiss / the fallback comes first.
  function handleSheetDismiss() {
    const action = afterSheetClosesRef.current;
    afterSheetClosesRef.current = null;
    action?.();
  }

  // Every navigation carries a fresh `visit` id: the Add Transaction screen is a
  // tab screen, which stays mounted between visits, and keys its content on it.
  function handleManualEntry() {
    setSheetOpen(false);
    router.push({ pathname: '/transaction/new', params: { visit: createRequestId() } });
  }

  async function handleScan(source: ImageSource) {
    const result = await pickImage(source);
    const asset = result && !result.canceled ? result.assets[0] : undefined;
    if (!asset) return;

    try {
      const image = await prepareScanImage(asset);
      if (estimateBase64Bytes(image.base64) > MAX_IMAGE_BYTES) {
        showToast('That image is too large to scan.');
        return;
      }
      // One requestId per picked image, reused by any automatic retry. It doubles
      // as the visit id, which is how the screen knows this image is for it.
      const requestId = createRequestId();
      useScanStore.getState().setPendingImage({ ...image, requestId });
      router.push({ pathname: '/transaction/new', params: { visit: requestId } });
    } catch {
      showToast("Couldn't read that image.");
    }
  }

  return (
    <>
      <Pressable
        style={styles.fab}
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <AddTransactionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onDismiss={handleSheetDismiss}
        onTakePhoto={() => closeSheetThen(() => void handleScan('camera'))}
        onUploadImage={() => closeSheetThen(() => void handleScan('library'))}
        onManualEntry={handleManualEntry}
      />
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -FAB_SIZE / 2,
    // Rendered as a sibling to the whole Tabs navigator (not nested inside
    // a single screen), so "bottom" here is relative to the full
    // content+tab-bar height. This places the button's vertical center
    // exactly on the tab bar's top edge, straddling content and tab bar.
    bottom: TAB_BAR_HEIGHT - FAB_SIZE / 2,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 4px 12px rgba(33, 150, 243, 0.45)',
    elevation: 8,
    zIndex: 100,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
});
