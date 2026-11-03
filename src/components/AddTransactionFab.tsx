import { useCallback,useContext, useEffect, useRef, useState } from 'react';
import { Alert,Platform,useWindowDimensions } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { createThemedStyles, useColors } from '../styles/theme';
import { MotionPressable } from './MotionPressable';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { tabBodyHeight } from '../constants/layout';
import { AddTransactionSheet } from './AddTransactionSheet';
import { useToastStore } from '../stores/useToastStore';
import { useScanStore } from '../stores/useScanStore';
import { prepareScanImage } from '../lib/prepareScanImage';
import { estimateBase64Bytes, createRequestId } from '../domain/ocr';
import { MAX_IMAGE_BYTES } from '../../supabase/functions/ocr/shared';
import {useHelpBlocker} from '../stores/useHelpStore';
import {runNativeHandoff,clearHandoffMarker,recoverNativeHandoff,handoffGeneration,waitForHandoffReturn} from '../lib/nativeHandoff';
import {usePreferencesStore} from '../stores/usePreferencesStore';
import {useAppLockStore} from '../stores/useAppLockStore';
import {loadTransactionDraft,clearTransactionDraft} from '../lib/transactionDraftStorage';
import {useRecoveredPickerStore} from '../stores/useRecoveredPickerStore';
import {useUpdateBlocker} from '../stores/useUpdateSafetyStore';

import {useAccountOperation} from '../hooks/useAccountOperation';
import {accountOperationActive} from '../lib/accountOperation';

const FAB_SIZE = 56;

type ImageSource = 'camera' | 'library';

function showToast(message: string) {
  useToastStore.getState().showToast(message);
}

// On desktop web, the camera picker falls back to a file dialog.
async function pickImage(source: ImageSource) {
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'] };
  if (source === 'library') return runNativeHandoff('receipt-upload',()=>ImagePicker.launchImageLibraryAsync(options));

  return runNativeHandoff('receipt-camera',async()=>{
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    showToast('Camera access is needed to scan a receipt.');
    return null;
  }
  return ImagePicker.launchCameraAsync(options);
  });
}

export function AddTransactionFab() {
  const styles = useStyles();
  const colors = useColors();
  const paused=useAccountOperation();
  const insets = useContext(SafeAreaInsetsContext);
  const {fontScale}=useWindowDimensions();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picking,setPicking]=useState(false);
  const pickingRef=useRef(false),recoveryChecked=useRef(false);
  const owner=usePreferencesStore(s=>s.profile?.user_id);
  const locked=useAppLockStore(s=>s.enabled&&(s.locked||s.obscured));
  useUpdateBlocker(picking);
  useHelpBlocker('add-transaction',sheetOpen);
  useHelpBlocker('receipt-picker',picking);
  const afterSheetClosesRef = useRef<(() => void) | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  if(paused&&sheetOpen)setSheetOpen(false);
  useEffect(()=>{if(paused){afterSheetClosesRef.current=null;if(fallbackTimerRef.current)clearTimeout(fallbackTimerRef.current);}},[paused]);
  const acceptImage=useCallback(async (asset:ImagePicker.ImagePickerAsset,startedOwner:string|undefined,attempt:number)=>{
    if(!startedOwner||accountOperationActive(startedOwner)||usePreferencesStore.getState().profile?.user_id!==startedOwner||attempt!==handoffGeneration())return;
    // Keep the image in memory through an expired guard; resume only after unlock.
    try {
      await waitForHandoffReturn(startedOwner,attempt);
      const image = await prepareScanImage(asset);
      if(accountOperationActive(startedOwner)||usePreferencesStore.getState().profile?.user_id!==startedOwner||attempt!==handoffGeneration())return;
      if (estimateBase64Bytes(image.base64) > MAX_IMAGE_BYTES) {
        showToast('That image is too large to scan.');
        return;
      }
      // One requestId per picked image, reused by any automatic retry. It doubles
      // as the visit id, which is how the screen knows this image is for it.
      const requestId = createRequestId();
      useScanStore.getState().setPendingImage({ ...image, requestId });
      await clearHandoffMarker();
      router.push({ pathname: '/transaction/new', params: { visit: requestId } });
    } catch {
      showToast("Couldn't read that image.");
    }
  },[router]);
  useEffect(()=>()=>{afterSheetClosesRef.current=null;if(fallbackTimerRef.current)clearTimeout(fallbackTimerRef.current);},[]);
  useEffect(()=>{
   if(!owner||paused||locked||recoveryChecked.current)return;
   recoveryChecked.current=true;
   const recoveryGeneration=handoffGeneration();
   void recoverNativeHandoff().then(recovered=>{
    if(!recovered||recoveryGeneration!==handoffGeneration()||accountOperationActive(owner)||usePreferencesStore.getState().profile?.user_id!==owner)return;
    Alert.alert('Resume selected image?','The app restarted while choosing an image. Review it before saving.',[
     {text:'Discard',style:'cancel'},
     {text:'Resume',onPress:()=>{
      if(recoveryGeneration!==handoffGeneration()||accountOperationActive(owner)||usePreferencesStore.getState().profile?.user_id!==owner)return;
      const asset=recovered.result.assets?.[0];if(!asset)return;
      if(recovered.marker.purpose==='avatar'){useRecoveredPickerStore.getState().setAvatar({owner,asset});router.push({pathname:'/settings',params:{section:'profile',visit:createRequestId()}});}
      else void acceptImage(asset,owner,handoffGeneration());
     }},
    ]);
   }).catch(()=>showToast('Could not recover the previous image. Choose it again.'));
  },[owner,paused,locked,router,acceptImage]);

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
    // A previous tap's timer must not fire against this tap's action.
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    afterSheetClosesRef.current = action;
    fallbackTimerRef.current = setTimeout(handleSheetDismiss, 800);
  }

  // Runs at most once per tap: whichever of onDismiss / the fallback comes first.
  function handleSheetDismiss() {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    const action = afterSheetClosesRef.current;
    afterSheetClosesRef.current = null;
    action?.();
  }

  // Every navigation carries a fresh `visit` id: the Add Transaction screen is a
  // tab screen, which stays mounted between visits, and keys its content on it.
  function handleManualEntry() {
    if(!owner||accountOperationActive(owner))return;
    setSheetOpen(false);
    router.push({ pathname: '/transaction/new', params: { visit: createRequestId() } });
  }
  async function handleVoiceEntry(){
   if(pickingRef.current||!owner||accountOperationActive(owner))return;
   pickingRef.current=true;setPicking(true);const attempt=handoffGeneration();
   try{
    const draft=await loadTransactionDraft(owner);
    if(accountOperationActive(owner)||usePreferencesStore.getState().profile?.user_id!==owner)return;
    const open=()=>{if(!accountOperationActive(owner)&&attempt===handoffGeneration()&&usePreferencesStore.getState().profile?.user_id===owner)router.push({pathname:'/transaction/voice',params:{visit:createRequestId()}});};
    if(!draft){open();return;}
    Alert.alert('Unfinished transaction',draft.pending?'A save was attempted. Resume it to check or retry the same entry before recording another.':'Resume your saved draft, or discard it before recording a new entry.',[
     {text:'Cancel',style:'cancel'},{text:'Resume draft',onPress:handleManualEntry},
     ...(!draft.pending?[{text:'Discard and record',style:'destructive' as const,onPress:()=>{
      if(accountOperationActive(owner)){return;}
      void clearTransactionDraft(owner).then(()=>{if(usePreferencesStore.getState().profile?.user_id===owner)open();}).catch(()=>showToast('Could not discard the draft. Try again.'));
     }}]:[]),
    ]);
   }catch{showToast('Could not check your draft. Retry before recording.');}
   finally{pickingRef.current=false;setPicking(false);}
  }

  async function handleScan(source: ImageSource) {
    if(pickingRef.current||accountOperationActive(owner)){return;}
    pickingRef.current=true;
    setPicking(true);
    try {await scan(source);} finally {pickingRef.current=false;setPicking(false);}
  }

  async function scan(source: ImageSource) {
    const startedOwner=usePreferencesStore.getState().profile?.user_id,attempt=handoffGeneration();
    let result: Awaited<ReturnType<typeof pickImage>>;
    try {
      result = await pickImage(source);
    } catch {
      showToast("Couldn't open the camera or photo library.");
      return;
    }
    const asset = result && !result.canceled ? result.assets[0] : undefined;
    if (!asset){await clearHandoffMarker().catch(()=>{});return;}
    await acceptImage(asset,startedOwner,attempt);
  }


  if(paused)return null;
  return (
    <>
      <MotionPressable
        style={[styles.fab, { bottom: tabBodyHeight(fontScale) + (insets?.bottom ?? 0) - FAB_SIZE / 2 }]}
        onPress={() => {if(!accountOperationActive(owner))setSheetOpen(true);}}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
      >
        <Plus color={colors.onPrimary} size={22} strokeWidth={2} />
      </MotionPressable>
      <AddTransactionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onDismiss={handleSheetDismiss}
        onTakePhoto={() => closeSheetThen(() => void handleScan('camera'))}
        onUploadImage={() => closeSheetThen(() => void handleScan('library'))}
        onManualEntry={handleManualEntry}
        onVoiceEntry={()=>closeSheetThen(()=>void handleVoiceEntry())}
      />
    </>
  );
}

const useStyles = createThemedStyles(colors => ({
  fab: {
    position: 'absolute',
    left: '50%',
    marginLeft: -FAB_SIZE / 2,
    // Position is relative to the navigator; the component adds safe-area insets.
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 0px 20px rgba(0, 0, 0, 0.36), 0px 0px 5px rgba(0, 0, 0, 0.18)',
    zIndex: 100,
  },
}));
