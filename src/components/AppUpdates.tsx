import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Keyboard, Text, View } from 'react-native';
import { useIsMutating, useQueryClient } from '@tanstack/react-query';
import { useReducedMotion } from 'react-native-reanimated';
import { Download, RefreshCw } from 'lucide-react-native';
import { checkAppUpdate, downloadAppUpdate, restartAppUpdate, useAppUpdateSnapshot } from '../lib/appUpdates';
import {settleTransactionDraftWrites} from '../lib/transactionDraftStorage';
import { updateProgress, updateRestartSafe, type UpdateSafety } from '../domain/appUpdates';
import { useUpdateSafetyStore } from '../stores/useUpdateSafetyStore';
import { useScanStore } from '../stores/useScanStore';
import { useHelpStore } from '../stores/useHelpStore';
import { useAccountDeletionStore } from '../stores/useAccountDeletionStore';
import { useFinancialResetStore } from '../stores/useFinancialResetStore';
import { usePreferencesStore } from '../stores/usePreferencesStore';
import { createThemedStyles, type, useColors } from '../styles/theme';
import { MotionPressable } from './MotionPressable';

type UpdateError = 'check' | 'download' | 'restart';
interface UpdateModel {
  enabled: boolean; ready: boolean; busy: boolean; downloading: boolean; checking: boolean; restarting: boolean;
  percent?: number; safe: boolean; banner: boolean; current: boolean; error?: UpdateError; lastChecked?: Date;
  check: () => void; restart: () => void; later: () => void;
}
const Context = createContext<UpdateModel | null>(null);

export function AppUpdatesProvider({ pathname, children }: { pathname: string; children: ReactNode }) {
  const native = useAppUpdateSnapshot(), client = useQueryClient(), mutations = useIsMutating();
  const blockers = useUpdateSafetyStore(state => state.blockers.length);
  const scan = useScanStore(state => !!state.pendingImage);
  const help = useHelpStore(state => state.visible || state.blockers.length > 0);
  const deletion = useAccountDeletionStore(state => !!state.pending || state.starting);
  const reset = useFinancialResetStore(state => !!state.pending || state.starting);
  const owner = usePreferencesStore(state => state.profile?.user_id);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [keyboard, setKeyboard] = useState(() => Keyboard.isVisible());
  const [phase, setPhase] = useState<'idle' | 'checking' | 'downloading' | 'restarting'>('idle');
  const [error, setError] = useState<UpdateError>(), [current, setCurrent] = useState(false);
  const [dismissed, setDismissed] = useState<string>();
  const running = useRef(false), alive = useRef(true), route = useRef(pathname);
  useLayoutEffect(() => { route.current = pathname; }, [pathname]);
  useEffect(() => {
    alive.current = true;
    const state = AppState.addEventListener('change', value => setForeground(value === 'active'));
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboard(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboard(false));
    return () => { alive.current = false; state.remove(); shown.remove(); hidden.remove(); };
  }, []);
  const safety: UpdateSafety = { pathname, foreground, keyboard, mutations, blockers, help, scan, accountOperation: deletion || reset || !owner };
  const safe = updateRestartSafe(safety);
  const checking = native.checking || phase === 'checking';
  const downloading = native.downloading || phase === 'downloading';
  const restarting = native.restarting || phase === 'restarting';
  const busy = native.startup || checking || downloading || restarting;
  const ready = native.ready;
  const key = native.pendingKey ?? 'pending';
  async function check() {
    if (!native.enabled || running.current || busy || ready) return;
    running.current = true; setError(undefined); setCurrent(false);
    let action: UpdateError = 'check';
    try {
      setPhase('checking');
      const available = native.available || await checkAppUpdate();
      if (!alive.current) return;
      if (available) {
        action = 'download'; setPhase('downloading');
        const downloaded = await downloadAppUpdate();
        if (!downloaded) throw new Error('No downloaded update.');
      } else setCurrent(true);
    } catch { if (alive.current) setError(action); }
    finally { running.current = false; if (alive.current) setPhase('idle'); }
  }
  function safeNow() {
    return updateRestartSafe({ ...safety, pathname: route.current, foreground: AppState.currentState === 'active', keyboard: Keyboard.isVisible(), mutations: client.isMutating(),
      blockers: useUpdateSafetyStore.getState().blockers.length,
      help: useHelpStore.getState().visible || useHelpStore.getState().blockers.length > 0,
      scan: !!useScanStore.getState().pendingImage,
      accountOperation: !!useAccountDeletionStore.getState().pending || useAccountDeletionStore.getState().starting || !!useFinancialResetStore.getState().pending || useFinancialResetStore.getState().starting || !usePreferencesStore.getState().profile?.user_id,
    });
  }
  async function restart() {
    if (!native.enabled || !ready || busy || running.current || !safeNow()) return;
    running.current = true; setPhase('restarting'); setError(undefined);
    const restartingOwner=usePreferencesStore.getState().profile?.user_id;
    try {
      await settleTransactionDraftWrites();
      if(!alive.current||!safeNow()||usePreferencesStore.getState().profile?.user_id!==restartingOwner){running.current=false;if(alive.current)setPhase('idle');return;}
      await restartAppUpdate();
      // reloadAsync resolves just before native schedules the reload. Stay locked.
    } catch { running.current = false; if (alive.current) {setError('restart');setPhase('idle');} }
  }
  const nativeError = native.downloadError ? 'download' : native.checkError ? 'check' : undefined;
  const model: UpdateModel = {
    enabled: native.enabled, ready, busy, downloading, checking, restarting, safe,
    percent: native.downloading ? updateProgress(native.progress) : undefined, current, error: ready ? error === 'restart' ? error : undefined : checking || downloading ? undefined : error ?? (current ? undefined : nativeError),
    lastChecked: native.lastChecked,
    banner: native.enabled && safe && (downloading || (ready && dismissed !== key)),
    check: () => { void check(); }, restart: () => { void restart(); }, later: () => setDismissed(key),
  };
  return <Context.Provider value={model}>{children}</Context.Provider>;
}

function Progress({ percent }: { percent?: number }) {
  const styles = useStyles(), colors = useColors(), reduced = useReducedMotion();
  if (percent === undefined) return <View style={styles.progressRow}>{reduced ? <Download size={17} color={colors.primary} /> : <ActivityIndicator size="small" color={colors.primary} />}<Text style={styles.caption}>Downloading update…</Text></View>;
  return <View style={{ gap: 8 }}>
    <View style={styles.progressRow}><Text style={[styles.caption, { flex: 1 }]}>{percent === 100 ? 'Finishing download…' : 'Downloading update'}</Text><Text style={styles.percent}>{percent}%</Text></View>
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Update download" accessibilityValue={{ min: 0, max: 100, now: percent }} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} style={styles.track}><View style={[styles.fill, { width: `${percent}%`, transitionProperty: 'width', transitionDuration: reduced ? 0 : 160 }]} /></View>
  </View>;
}

export function UpdateBanner() {
  const update = useContext(Context), styles = useStyles();
  if (!update?.banner) return null;
  return <View testID="app-update-banner" style={styles.banner}>
    {update.downloading ? <Progress percent={update.percent} /> : <>
      <Text accessibilityLiveRegion="polite" style={styles.title}>Update ready</Text>
      <Text style={styles.caption}>Restart to use the latest improvements.</Text>
      <View style={styles.actions}>
        <MotionPressable disabled={update.busy || !update.safe} style={styles.primary} onPress={update.restart}><Text style={styles.primaryText}>{update.restarting ? 'Restarting…' : 'Restart now'}</Text></MotionPressable>
        <MotionPressable disabled={update.restarting} style={styles.secondary} onPress={update.later}><Text style={styles.secondaryText}>Later</Text></MotionPressable>
      </View>
      {update.error === 'restart' && <Text accessibilityRole="alert" style={styles.error}>Could not restart. Try again, or reopen the app when ready.</Text>}
    </>}
  </View>;
}

export function AppUpdatesSettings() {
  const update = useContext(Context), styles = useStyles(), colors = useColors();
  return <View style={{ gap: 16 }}>
    <Text accessibilityRole="header" style={styles.heading}>App updates</Text>
    {!update?.enabled ? <Text style={styles.caption}>Updates are available in the installed phone app.</Text> : <>
      <Text accessibilityLiveRegion="polite" style={styles.body}>{update.restarting ? 'Restarting…' : update.ready ? 'An update is ready to use.' : update.checking ? 'Checking for updates…' : update.current ? 'You’re up to date.' : 'Updates download in the background when you open the app.'}</Text>
      {update.downloading && <Progress percent={update.percent} />}
      {!update.ready && !update.downloading && <MotionPressable disabled={update.busy} style={styles.check} onPress={update.check}><RefreshCw size={17} color={colors.primary} /><Text style={styles.secondaryText}>{update.checking ? 'Checking…' : update.error ? 'Retry update' : 'Check for updates'}</Text></MotionPressable>}
      {update.ready && <>
        {!update.safe && <Text style={styles.caption}>Finish or close your open forms, scans and saves before restarting.</Text>}
        <MotionPressable disabled={update.busy || !update.safe} style={styles.primary} onPress={update.restart}><Text style={styles.primaryText}>{update.restarting ? 'Restarting…' : 'Restart now'}</Text></MotionPressable>
      </>}
      {update.error && <Text accessibilityRole="alert" style={styles.error}>{update.error === 'restart' ? 'Could not restart. Try again, or reopen the app when ready.' : update.error === 'download' ? 'Could not download the update. Check your connection and retry.' : 'Could not check for updates. Check your connection and retry.'}</Text>}
      {update.lastChecked && <Text style={styles.caption}>Last checked: {update.lastChecked.toLocaleString()}</Text>}
    </>}
  </View>;
}
const useStyles = createThemedStyles(colors => ({
  banner: { gap: 8, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  heading: { ...type.heading, color: colors.text }, title: { ...type.label, color: colors.text },
  body: { ...type.body, color: colors.text }, caption: { ...type.label, fontWeight: '400', color: colors.muted },
  percent: { ...type.number, fontSize: 13, color: colors.text }, progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: 'hidden' }, fill: { height: 4, backgroundColor: colors.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { minHeight: 48, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.primary },
  primaryText: { ...type.label, color: colors.onPrimary },
  secondary: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' }, secondaryText: { ...type.label, color: colors.primary },
  check: { minHeight: 48, flexDirection: 'row', gap: 10, alignItems: 'center' }, error: { ...type.body, color: colors.danger },
}));
