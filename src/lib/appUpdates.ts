import { unavailableUpdate } from './appUpdates.types';

// Web/SSR have no native OTA client. Metro selects appUpdates.native on phones.
export function useAppUpdateSnapshot() { return unavailableUpdate; }
export async function checkAppUpdate(): Promise<boolean> { return false; }
export async function downloadAppUpdate(): Promise<boolean> { return false; }
export async function restartAppUpdate(): Promise<void> {}
