/**
 * Which shell (if any) the web app is running inside, and the native surface it
 * can reach from there.
 *
 * Two desktop shells exist and are installable side by side: the shipped Electron
 * app and the Tauri "Exponential Beta" foray build. They inject completely
 * different globals and speak different IPC, but the app only ever needs the same
 * two operations from either — start sign-in, collect the result. `DesktopBridge`
 * is that shared contract, so feature code never branches on which shell it is in.
 */

/** The desktop shells that can host the web app. */
export type DesktopShell = "electron" | "tauri";

/**
 * The one-time PKCE pair captured from the shell's deep-link callback. Delivered
 * over IPC rather than the page URL so the verifier — the secret protecting the
 * auth code — never lands in access logs, history, or a Referer header.
 */
export interface PendingAuth {
  code: string;
  verifier: string;
}

/**
 * The native surface the web app depends on. Deliberately minimal: exactly the
 * sign-in handshake, nothing else. Anything shell-specific (window controls,
 * local wiki commands) stays off this interface.
 */
export interface DesktopBridge {
  /** Which shell is hosting us — for behaviour that genuinely differs. */
  readonly shell: DesktopShell;
  /**
   * Start the desktop sign-in flow: opens the system browser to complete OAuth
   * (where passkeys work) and returns to the app via the shell's deep link.
   * Resolves once the browser has been opened, not when sign-in finishes.
   */
  startLogin: () => Promise<void>;
  /**
   * One-shot fetch of the `{code, verifier}` pair captured from the deep-link
   * callback. Returns null if there's no pending sign-in — including on a second
   * call, since the shell drops the pair once handed over.
   */
  getPendingAuth: () => Promise<PendingAuth | null>;
}

/**
 * Type for the Electron API exposed via preload script.
 *
 * Broader than `DesktopBridge` — the window controls have no Tauri counterpart
 * and no caller today.
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
  startLogin: () => Promise<void>;
  getPendingAuth: () => Promise<PendingAuth | null>;
}

/** Tauri's IPC primitive, injected into every page the shell loads. */
interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

type ShellWindow = Window & {
  electron?: ElectronAPI;
  __TAURI_INTERNALS__?: Partial<TauriInternals>;
};

function shellWindow(): ShellWindow | null {
  return typeof window === "undefined" ? null : (window as ShellWindow);
}

function electronApi(): ElectronAPI | null {
  return shellWindow()?.electron ?? null;
}

/**
 * Tauri's IPC entry point, or null outside the Tauri shell.
 *
 * We detect on this global rather than sniffing the user agent because it is the
 * thing that actually matters: the shell only injects a working bridge for
 * origins granted a remote-domain capability, so its presence means commands will
 * really run.
 */
function tauriInternals(): TauriInternals | null {
  const internals = shellWindow()?.__TAURI_INTERNALS__;
  return typeof internals?.invoke === "function" ? (internals as TauriInternals) : null;
}

/** Narrow an unknown IPC result to a usable pair; anything malformed is "none". */
function asPendingAuth(value: unknown): PendingAuth | null {
  if (typeof value !== "object" || value === null) return null;
  const { code, verifier } = value as Partial<PendingAuth>;
  if (typeof code !== "string" || !code) return null;
  if (typeof verifier !== "string" || !verifier) return null;
  return { code, verifier };
}

/**
 * The bridge for whichever shell is hosting this page, or null in a browser.
 *
 * Electron is checked first purely for determinism — the two globals never
 * coexist.
 */
export function getDesktopBridge(): DesktopBridge | null {
  const electron = electronApi();
  if (electron) {
    return {
      shell: "electron",
      startLogin: () => electron.startLogin(),
      getPendingAuth: async () => asPendingAuth(await electron.getPendingAuth()),
    };
  }

  const tauri = tauriInternals();
  if (tauri) {
    return {
      shell: "tauri",
      startLogin: async () => {
        await tauri.invoke("desktop_start_login");
      },
      getPendingAuth: async () => asPendingAuth(await tauri.invoke("desktop_get_pending_auth")),
    };
  }

  return null;
}

/**
 * Check if running in Electron renderer process
 */
export function isElectron(): boolean {
  return getDesktopBridge()?.shell === "electron";
}

/**
 * Check if running in the Tauri desktop shell
 */
export function isTauri(): boolean {
  return getDesktopBridge()?.shell === "tauri";
}

/**
 * Check if running inside any desktop shell
 */
export function isDesktop(): boolean {
  return getDesktopBridge() !== null;
}

/**
 * Check if running in a web browser (not a desktop shell)
 */
export function isWeb(): boolean {
  if (typeof window === "undefined") return false;
  return !isDesktop();
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
export function getPlatform(): DesktopShell | "web" | "server" {
  if (isServer()) return "server";
  return getDesktopBridge()?.shell ?? "web";
}

/**
 * Platform information object
 */
export const platform = {
  get isElectron() {
    return isElectron();
  },
  get isTauri() {
    return isTauri();
  },
  get isDesktop() {
    return isDesktop();
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
 * Get the Electron API if available.
 *
 * @deprecated For sign-in use {@link getDesktopBridge}, which works in both
 * shells. This remains only for the Electron-only window/app controls.
 */
export function getElectronAPI(): ElectronAPI | null {
  return getDesktopBridge()?.shell === "electron" ? electronApi() : null;
}
