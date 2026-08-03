import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getDesktopBridge,
  getElectronAPI,
  getPlatform,
  isDesktop,
  isElectron,
  isTauri,
  isWeb,
} from "../platform";

/**
 * The bridge exists so the sign-in flow stops caring which shell it is in, and
 * these tests are what keep that promise honest: the two adapters must be
 * indistinguishable to callers, and a plain browser must get nothing at all.
 */

type MutableWindow = Window & {
  electron?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

function win(): MutableWindow {
  return window as MutableWindow;
}

/** Stand in for the Electron preload's `window.electron`. */
function installElectron(overrides: Record<string, unknown> = {}) {
  const api = {
    startLogin: vi.fn().mockResolvedValue(undefined),
    getPendingAuth: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
  win().electron = api;
  return api;
}

/** Stand in for the global Tauri injects into every page it loads. */
function installTauri(invoke = vi.fn().mockResolvedValue(null)) {
  win().__TAURI_INTERNALS__ = { invoke };
  return invoke;
}

afterEach(() => {
  delete win().electron;
  delete win().__TAURI_INTERNALS__;
  vi.restoreAllMocks();
});

describe("shell detection", () => {
  it("reports a plain browser as web with no bridge", () => {
    expect(getDesktopBridge()).toBeNull();
    expect(getPlatform()).toBe("web");
    expect(isWeb()).toBe(true);
    expect(isDesktop()).toBe(false);
    expect(isElectron()).toBe(false);
    expect(isTauri()).toBe(false);
  });

  it("detects Electron from its preload global", () => {
    installElectron();
    expect(getDesktopBridge()?.shell).toBe("electron");
    expect(getPlatform()).toBe("electron");
    expect(isElectron()).toBe(true);
    expect(isTauri()).toBe(false);
    expect(isDesktop()).toBe(true);
    expect(isWeb()).toBe(false);
  });

  it("detects Tauri from its IPC global", () => {
    installTauri();
    expect(getDesktopBridge()?.shell).toBe("tauri");
    expect(getPlatform()).toBe("tauri");
    expect(isTauri()).toBe(true);
    expect(isElectron()).toBe(false);
    expect(isDesktop()).toBe(true);
    expect(isWeb()).toBe(false);
  });

  it("ignores a Tauri global with no usable invoke", () => {
    // A half-injected global would otherwise route sign-in into a shell that
    // cannot answer, stranding the user on a spinner.
    win().__TAURI_INTERNALS__ = { metadata: {} };
    expect(getDesktopBridge()).toBeNull();
    expect(isTauri()).toBe(false);
  });
});

describe("startLogin", () => {
  it("delegates to the Electron preload", async () => {
    const api = installElectron();
    await getDesktopBridge()?.startLogin();
    expect(api.startLogin).toHaveBeenCalledOnce();
  });

  it("invokes the Tauri command", async () => {
    const invoke = installTauri();
    await getDesktopBridge()?.startLogin();
    expect(invoke).toHaveBeenCalledWith("desktop_start_login");
  });
});

describe("getPendingAuth", () => {
  const pair = { code: "auth-code", verifier: "pkce-verifier" };

  it("returns the pair from Electron", async () => {
    installElectron({ getPendingAuth: vi.fn().mockResolvedValue(pair) });
    await expect(getDesktopBridge()?.getPendingAuth()).resolves.toEqual(pair);
  });

  it("returns the pair from Tauri", async () => {
    const invoke = installTauri(vi.fn().mockResolvedValue(pair));
    await expect(getDesktopBridge()?.getPendingAuth()).resolves.toEqual(pair);
    expect(invoke).toHaveBeenCalledWith("desktop_get_pending_auth");
  });

  it("returns null when no sign-in is pending", async () => {
    installTauri(vi.fn().mockResolvedValue(null));
    await expect(getDesktopBridge()?.getPendingAuth()).resolves.toBeNull();
  });

  it.each([
    ["a half-filled pair", { code: "auth-code" }],
    ["blank fields", { code: "", verifier: "" }],
    ["wrong types", { code: 1, verifier: true }],
    ["a bare string", "auth-code"],
  ])("treats %s as no pending sign-in", async (_label, value) => {
    // `/desktop-auth` reads this once and gives up if it's empty. Better to fail
    // there, visibly, than to POST junk at the credentials provider.
    installTauri(vi.fn().mockResolvedValue(value));
    await expect(getDesktopBridge()?.getPendingAuth()).resolves.toBeNull();
  });
});

describe("getElectronAPI (deprecated)", () => {
  it("still hands back the Electron API inside Electron", () => {
    const api = installElectron();
    expect(getElectronAPI()).toBe(api);
  });

  it("is null in Tauri and in a browser", () => {
    installTauri();
    expect(getElectronAPI()).toBeNull();
    delete win().__TAURI_INTERNALS__;
    expect(getElectronAPI()).toBeNull();
  });
});
