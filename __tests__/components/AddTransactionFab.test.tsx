import {useFinancialResetStore} from '../../src/stores/useFinancialResetStore';
import {useAccountDeletionStore} from '../../src/stores/useAccountDeletionStore';
import { Modal, Platform,AppState } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { AddTransactionFab } from '../../src/components/AddTransactionFab';
import { prepareScanImage } from '../../src/lib/prepareScanImage';
import {usePreferencesStore,defaultProfile} from '../../src/stores/usePreferencesStore';
import {useAppLockStore} from '../../src/stores/useAppLockStore';
import {invalidateNativeHandoffs} from '../../src/lib/nativeHandoff';
import { useScanStore } from '../../src/stores/useScanStore';
import { useToastStore } from '../../src/stores/useToastStore';
import { MAX_IMAGE_BYTES, isUuid } from '../../supabase/functions/ocr/shared';

const mockPush = jest.fn();
// Recovery has its own guard tests; do not race its startup storage read against
// this component suite's immediate picker taps.
jest.mock('../../src/lib/nativeHandoff',()=>({
  ...jest.requireActual('../../src/lib/nativeHandoff'),
  recoverNativeHandoff:jest.fn(async()=>null),
}));
jest.mock('../../src/lib/encryptedStorage',()=>({encryptedStorage:{setItem:jest.fn(async()=>{}),removeItem:jest.fn(async()=>{}),getItem:jest.fn(async()=>null)}}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));

jest.mock('../../src/lib/prepareScanImage', () => ({
  prepareScanImage: jest.fn(),
}));

const launchLibrary = jest.mocked(ImagePicker.launchImageLibraryAsync);
const launchCamera = jest.mocked(ImagePicker.launchCameraAsync);
const requestCameraPermission = jest.mocked(ImagePicker.requestCameraPermissionsAsync);
const prepare = jest.mocked(prepareScanImage);

const PICKED = { canceled: false, assets: [{ uri: 'file:///receipt.heic', width: 3000, height: 4000 }] };
const PREPARED = { uri: 'file:///receipt.jpg', base64: 'AAAA', mimeType: 'image/jpeg' as const };

function renderFab() {
  render(<AddTransactionFab />);
}

function openSheet() {
  fireEvent.press(screen.getByLabelText('Add transaction'));
}

function toastMessage() {
  return useToastStore.getState().message;
}

beforeEach(() => {
  jest.clearAllMocks();
  useFinancialResetStore.setState({pending:null,starting:false});
  useAccountDeletionStore.setState({pending:null,starting:false});
  invalidateNativeHandoffs();
  usePreferencesStore.getState().setProfile(defaultProfile('00000000-0000-4000-8000-000000000001'));
  useAppLockStore.setState({loaded:true,enabled:false,locked:false,obscured:false});
  Object.defineProperty(AppState,'currentState',{value:'active',writable:true,configurable:true});
  useScanStore.setState({ pendingImage: null });
  useToastStore.setState({ message: null });
  requestCameraPermission.mockResolvedValue({ granted: true } as ImagePicker.PermissionResponse);
  launchLibrary.mockResolvedValue(PICKED as unknown as ImagePicker.ImagePickerResult);
  launchCamera.mockResolvedValue(PICKED as unknown as ImagePicker.ImagePickerResult);
  prepare.mockResolvedValue(PREPARED);
  jest.replaceProperty(Platform, 'OS', 'android');
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('AddTransactionFab', () => {
  it('Manual Entry pushes the new-transaction screen with a fresh visit id', () => {
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Manual Entry'));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const arg = mockPush.mock.calls[0][0];
    expect(arg.pathname).toBe('/transaction/new');
    expect(isUuid(arg.params.visit)).toBe(true);
    expect(useScanStore.getState().pendingImage).toBeNull();
  });

  it('a successful scan stores the image with a requestId equal to the pushed visit id', async () => {
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Upload Image'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    const pending = useScanStore.getState().pendingImage;
    expect(pending).toMatchObject(PREPARED);
    expect(isUuid(pending?.requestId)).toBe(true);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/transaction/new',
      params: { visit: pending?.requestId },
    });
    expect(prepare).toHaveBeenCalledWith(PICKED.assets[0]);
  });

  it('Take Photo with camera permission denied toasts and does not launch the camera', async () => {
    requestCameraPermission.mockResolvedValue({ granted: false } as ImagePicker.PermissionResponse);
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Take Photo'));

    await waitFor(() => expect(toastMessage()).toBe('Camera access is needed to scan a receipt.'));
    expect(launchCamera).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('Take Photo launches the camera when permission is granted', async () => {
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Take Photo'));

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(launchCamera).toHaveBeenCalledTimes(1);
    expect(launchLibrary).not.toHaveBeenCalled();
  });

  it('a cancelled picker neither navigates nor toasts', async () => {
    launchLibrary.mockResolvedValue({ canceled: true, assets: null } as ImagePicker.ImagePickerResult);
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Upload Image'));

    await waitFor(() => expect(launchLibrary).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(mockPush).not.toHaveBeenCalled();
    expect(toastMessage()).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it('toasts and does not navigate when image preparation fails', async () => {
    prepare.mockRejectedValue(new Error('boom'));
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Upload Image'));

    await waitFor(() => expect(toastMessage()).toBe("Couldn't read that image."));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useScanStore.getState().pendingImage).toBeNull();
  });

  it('toasts and does not navigate when the prepared image is too large', async () => {
    prepare.mockResolvedValue({ ...PREPARED, base64: 'A'.repeat(Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4) });
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Upload Image'));

    await waitFor(() => expect(toastMessage()).toBe('That image is too large to scan.'));
    expect(mockPush).not.toHaveBeenCalled();
    expect(useScanStore.getState().pendingImage).toBeNull();
  });

  it('toasts and does not navigate when the picker rejects', async () => {
    launchLibrary.mockRejectedValue(new Error('picker failed'));
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Upload Image'));

    await waitFor(() => expect(toastMessage()).toBe("Couldn't open the camera or photo library."));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('toasts and does not navigate when the camera permission request rejects', async () => {
    requestCameraPermission.mockRejectedValue(new Error('permission failed'));
    renderFab();
    openSheet();
    fireEvent.press(screen.getByLabelText('Take Photo'));

    await waitFor(() => expect(toastMessage()).toBe("Couldn't open the camera or photo library."));
    expect(launchCamera).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  describe('on iOS', () => {
    beforeEach(() => {
      jest.replaceProperty(Platform, 'OS', 'ios');
    });

    it('waits for the sheet to finish closing before opening the picker', async () => {
      renderFab();
      openSheet();
      const onDismiss = screen.UNSAFE_getByType(Modal).props.onDismiss as () => void;
      fireEvent.press(screen.getByLabelText('Upload Image'));

      await act(async () => {});
      expect(launchLibrary).not.toHaveBeenCalled();

      await act(async () => {
        onDismiss();
      });
      await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
      expect(launchLibrary).toHaveBeenCalledTimes(1);
    });

    it('falls back after 800 ms and still opens the picker only once', async () => {
      jest.useFakeTimers();
      renderFab();
      openSheet();
      const onDismiss = screen.UNSAFE_getByType(Modal).props.onDismiss as () => void;
      fireEvent.press(screen.getByLabelText('Upload Image'));

      await act(async () => {
        jest.advanceTimersByTime(799);
      });
      expect(launchLibrary).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(launchLibrary).toHaveBeenCalledTimes(1);

      await act(async () => {
        onDismiss();
      });
      expect(launchLibrary).toHaveBeenCalledTimes(1);
    });

    it('does not let a stale timer from an earlier tap run a later tap early', async () => {
      jest.useFakeTimers();
      renderFab();
      openSheet();
      const onDismiss = screen.UNSAFE_getByType(Modal).props.onDismiss as () => void;
      fireEvent.press(screen.getByLabelText('Upload Image'));

      // Second tap (camera) 500 ms later, before the first one's fallback fires.
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      openSheet();
      fireEvent.press(screen.getByLabelText('Take Photo'));

      // 300 ms later is the first tap's original 800 ms deadline: nothing may run.
      await act(async () => {
        jest.advanceTimersByTime(300);
      });
      expect(launchLibrary).not.toHaveBeenCalled();
      expect(requestCameraPermission).not.toHaveBeenCalled();

      await act(async () => {
        onDismiss();
      });
      expect(requestCameraPermission).toHaveBeenCalledTimes(1);
      expect(launchLibrary).not.toHaveBeenCalled();
    });
  });
});

test('hides the add button and an open entry sheet during account cleanup',()=>{
 renderFab();openSheet();expect(screen.getByLabelText('Manual Entry')).toBeTruthy();
 act(()=>useFinancialResetStore.setState({starting:true}));
 expect(screen.queryByLabelText('Add transaction')).toBeNull();expect(screen.queryByLabelText('Manual Entry')).toBeNull();
 act(()=>useFinancialResetStore.setState({starting:false}));
 expect(screen.getByLabelText('Add transaction')).toBeTruthy();expect(screen.queryByLabelText('Manual Entry')).toBeNull();
 act(()=>useAccountDeletionStore.setState({pending:{owner:usePreferencesStore.getState().profile!.user_id,requestId:'request',accepted:true}}));
 expect(screen.queryByLabelText('Add transaction')).toBeNull();
});
test('ignores a camera result returned during clearing',async()=>{
 let finish:(value:ImagePicker.ImagePickerResult)=>void=()=>{};launchCamera.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 renderFab();openSheet();fireEvent.press(screen.getByLabelText('Take Photo'));await waitFor(()=>expect(launchCamera).toHaveBeenCalledTimes(1));
 act(()=>useFinancialResetStore.setState({starting:true}));
 await act(async()=>finish(PICKED as unknown as ImagePicker.ImagePickerResult));
 expect(mockPush).not.toHaveBeenCalled();expect(useScanStore.getState().pendingImage).toBeNull();
});
test('a different owners pending cleanup does not hide this accounts add button',()=>{
 useFinancialResetStore.setState({pending:{owner:'other-owner',requestId:'request',accepted:true}});renderFab();expect(screen.getByLabelText('Add transaction')).toBeTruthy();
});

test('unmounting cancels a deferred iOS picker even if its dismissal arrives later',async()=>{
 jest.replaceProperty(Platform,'OS','ios');const view=render(<AddTransactionFab/>);openSheet();
 const dismiss=screen.UNSAFE_getByType(Modal).props.onDismiss as ()=>void;
 fireEvent.press(screen.getByLabelText('Upload Image'));view.unmount();await act(async()=>dismiss());
 expect(launchLibrary).not.toHaveBeenCalled();expect(mockPush).not.toHaveBeenCalled();
});
