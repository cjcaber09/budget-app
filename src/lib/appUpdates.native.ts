import * as Updates from 'expo-updates';
import type { AppUpdateSnapshot } from './appUpdates.types';

export function useAppUpdateSnapshot(): AppUpdateSnapshot {
  const state = Updates.useUpdates();
  const downloaded = state.downloadedUpdate;
  return {
    enabled: Updates.isEnabled && !__DEV__,
    startup: state.isStartupProcedureRunning, checking: state.isChecking,
    downloading: state.isDownloading, restarting: state.isRestarting,
    available: state.isUpdateAvailable, ready: state.isUpdatePending,
    progress: state.downloadProgress,
    pendingKey: downloaded ? downloaded.updateId ?? `rollback:${downloaded.createdAt.toISOString()}` : undefined,
    checkError: state.checkError, downloadError: state.downloadError,
    lastChecked: state.lastCheckForUpdateTimeSinceRestart,
  };
}
export async function checkAppUpdate() {
  const result = await Updates.checkForUpdateAsync();
  return result.isAvailable || result.isRollBackToEmbedded;
}
export async function downloadAppUpdate() {
  const result = await Updates.fetchUpdateAsync();
  return result.isNew || result.isRollBackToEmbedded;
}
export async function restartAppUpdate() { await Updates.reloadAsync(); }
