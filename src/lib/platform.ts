/**
 * Platform detection utilities for Electron/Web environments
 */

/**
 * Check if running in Electron renderer process
 */
export function isElectron(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as Window & { electron?: unknown }).electron;
}

/**
 * Check if running in a web browser (not Electron)
 */
export function isWeb(): boolean {
  if (typeof window === "undefined") return false;
  return !isElectron();
}

/**
 * Check if running on server (SSR)
 */
export function isServer(): boolean {
  return typeof window === "undefined";
}

/**
 * Get the current platform
 */
export function getPlatform(): "electron" | "web" | "server" {
  if (isServer()) return "server";
  if (isElectron()) return "electron";
  return "web";
}

/**
 * Platform information object
 */
export const platform = {
  get isElectron() {
    return isElectron();
  },
  get isWeb() {
    return isWeb();
  },
  get isServer() {
    return isServer();
  },
  get current() {
    return getPlatform();
  },
} as const;

/**
 * Type for the Electron API exposed via preload script
 */
export interface ElectronAPI {
  platform: string;
  isElectron: boolean;
  send: (channel: string, data: unknown) => void;
  receive: (channel: string, func: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, func: (...args: unknown[]) => void) => void;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  getAppVersion: () => Promise<string>;
}

/**
 * Get the Electron API if available
 */
export function getElectronAPI(): ElectronAPI | null {
  if (!isElectron()) return null;
  return (window as Window & { electron?: ElectronAPI }).electron ?? null;
}
