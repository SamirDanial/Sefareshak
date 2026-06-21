import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Example: expose methods for IPC communication
  // You can add more methods here as needed
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  // Play notification sound via IPC
  playNotificationSound: (type: 'newOrder' | 'statusChange') => {
    return ipcRenderer.invoke('play-notification-sound', type);
  },
  // Set badge count on app icon
  setBadgeCount: (count: number) => {
    return ipcRenderer.invoke('set-badge-count', count);
  },
  // Listen for OAuth callbacks
  onOAuthCallback: (callback: (url: string) => void) => {
    ipcRenderer.on('oauth-callback', (_event, url) => callback(url));
    // Return cleanup function
    return () => ipcRenderer.removeAllListeners('oauth-callback');
  },

  // Clear Electron session storage/cookies/cache.
  // This is required to reliably force Google/Clerk to show the account chooser.
  clearAuthSession: () => {
    return ipcRenderer.invoke('clear-auth-session');
  },

  restartApp: () => {
    return ipcRenderer.invoke('restart-app');
  },

  openKitchenWindow: (options?: { branchId?: string }) => {
    return ipcRenderer.invoke('open-kitchen-window', options || {});
  },

  openBarWindow: (options?: { branchId?: string }) => {
    return ipcRenderer.invoke('open-bar-window', options || {});
  },

  openDispatchWindow: (options?: { branchId?: string }) => {
    return ipcRenderer.invoke('open-dispatch-window', options || {});
  },

  openDevTools: (options?: { target?: 'main' | 'kitchen' | 'bar' | 'dispatch' }) => {
    return ipcRenderer.invoke('open-window-devtools', options || {});
  },
});

