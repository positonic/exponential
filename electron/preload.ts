import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  // Platform info
  platform: process.platform,
  isElectron: true,

  // IPC communication (for future use)
  send: (channel: string, data: unknown): void => {
    // Whitelist of allowed channels
    const validChannels = ["oauth-callback", "window-control", "app-ready"];
    if (validChannels.includes(channel)) {
      ipcRenderer.send(channel, data);
    }
  },

  receive: (channel: string, func: (...args: unknown[]) => void): void => {
    const validChannels = ["oauth-result", "deep-link", "update-available"];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_event, ...args) => func(...args));
    }
  },

  // Remove listener
  removeListener: (channel: string, func: (...args: unknown[]) => void): void => {
    const validChannels = ["oauth-result", "deep-link", "update-available"];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  },

  // Window controls
  minimize: (): void => {
    ipcRenderer.send("window-control", "minimize");
  },

  maximize: (): void => {
    ipcRenderer.send("window-control", "maximize");
  },

  close: (): void => {
    ipcRenderer.send("window-control", "close");
  },

  // App info
  getAppVersion: (): Promise<string> => {
    return ipcRenderer.invoke("get-app-version");
  },
});

// Type declaration for the exposed API
declare global {
  interface Window {
    electron?: {
      platform: string;
      isElectron: boolean;
      send: (channel: string, data: unknown) => void;
      receive: (channel: string, func: (...args: unknown[]) => void) => void;
      removeListener: (channel: string, func: (...args: unknown[]) => void) => void;
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      getAppVersion: () => Promise<string>;
    };
  }
}
