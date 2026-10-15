export interface AppUpdateSnapshot {
  enabled: boolean;
  startup: boolean;
  checking: boolean;
  downloading: boolean;
  restarting: boolean;
  available: boolean;
  ready: boolean;
  progress?: number;
  pendingKey?: string;
  checkError?: Error;
  downloadError?: Error;
  lastChecked?: Date;
}
export const unavailableUpdate: AppUpdateSnapshot = {
  enabled: false, startup: false, checking: false, downloading: false,
  restarting: false, available: false, ready: false,
};
