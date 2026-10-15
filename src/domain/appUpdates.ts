export interface UpdateSafety {
  pathname: string;
  foreground: boolean;
  keyboard: boolean;
  mutations: number;
  blockers: number;
  help: boolean;
  scan: boolean;
  accountOperation: boolean;
}
export function updateRestartSafe(state: UpdateSafety) {
  return ['/', '/transactions', '/reports', '/settings'].includes(state.pathname)
    && state.foreground && !state.keyboard && state.mutations === 0 && state.blockers === 0
    && !state.help && !state.scan && !state.accountOperation;
}
export function updateProgress(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? Math.floor(value * 100) : undefined;
}
