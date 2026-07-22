import {
  app,
  BrowserWindow,
  shell,
  protocol,
  session,
  ipcMain,
} from "electron";
import path from "path";
import crypto from "crypto";
import { electronColors } from "./colors";

// Custom protocol for OAuth callbacks
const PROTOCOL_NAME = "exponential";

// Register protocol scheme - MUST be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: PROTOCOL_NAME,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
    },
  },
]);

// Environment detection
const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
const DEV_URL = "http://localhost:3000";
const PROD_URL = process.env.ELECTRON_PROD_URL ?? "https://exponential.im";

let mainWindow: BrowserWindow | null = null;

// OAuth provider domains that should open in external browser
const OAUTH_PROVIDERS = [
  "accounts.google.com",
  "discord.com",
  "api.notion.com",
  "github.com",
  "login.microsoftonline.com",
];

function isOAuthProviderUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return OAUTH_PROVIDERS.some((provider) => urlObj.hostname.includes(provider));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Desktop sign-in (system-browser OAuth + exponential:// deep link).
//
// Chromium in Electron has no platform authenticator, so Google passkeys can't
// complete in-window. Instead we run the whole sign-in in the system browser
// via `/api/auth/native/start` (the existing native handshake) and return via
// the exponential:// deep link. PKCE binds the flow: the verifier lives only
// here in the main process and never leaves it, so an intercepted auth code is
// useless. One login may be in flight at a time.
// ---------------------------------------------------------------------------
let pendingLogin: { verifier: string; state: string } | null = null;
// The redeemable {code, verifier} pair, held between the deep-link callback and
// the /desktop-auth page picking it up over IPC. Kept out of the page URL on
// purpose so the verifier never lands in access logs, history, or Referer
// headers. One-shot: cleared on first read.
let pendingAuth: { code: string; verifier: string } | null = null;

/** Base URL the app is running against — sign-in must use the same origin. */
function appBaseUrl(): string {
  return isDev ? DEV_URL : PROD_URL;
}

/** 32 random bytes → 43 base64url chars (matches the server's PKCE sizing). */
function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** PKCE S256: base64url(sha256(verifier)). */
function pkceChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function startDesktopLogin(): void {
  const verifier = randomToken();
  const state = randomToken();
  pendingLogin = { verifier, state };

  const authUrl =
    `${appBaseUrl()}/api/auth/native/start` +
    `?code_challenge=${encodeURIComponent(pkceChallenge(verifier))}` +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(`${PROTOCOL_NAME}://auth/callback`)}`;

  void shell.openExternal(authUrl);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    show: false,
    backgroundColor: electronColors.backgroundPrimary,
  });

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  // Load the app
  const startUrl = isDev ? DEV_URL : PROD_URL;
  void mainWindow.loadURL(startUrl);

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Allow navigation within the app
    if (url.startsWith(DEV_URL) || url.startsWith(PROD_URL)) {
      return { action: "allow" };
    }
    // Open external links in default browser
    void shell.openExternal(url);
    return { action: "deny" };
  });

  // Handle navigation - let OAuth happen within Electron for seamless UX
  // Only open truly external links (not OAuth providers) in system browser
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const urlObj = new URL(url);

    // Allow navigation within our app
    if (urlObj.origin === DEV_URL || urlObj.origin === PROD_URL) {
      return;
    }

    // Allow OAuth provider navigation within Electron
    if (isOAuthProviderUrl(url)) {
      return;
    }

    // Block other external navigation (open in system browser instead)
    event.preventDefault();
    void shell.openExternal(url);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Register custom protocol for OAuth callbacks
function setupProtocolHandler(): void {
  // Set as default protocol handler
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [
        path.resolve(process.argv[1] ?? ""),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL_NAME);
  }

  // Handle protocol on macOS
  app.on("open-url", (_event, url) => {
    handleOAuthCallback(url);
  });
}

// Handle the exponential://auth/callback?code&state deep link that closes the
// system-browser sign-in. We validate `state` against the login we started,
// then hand the one-time code + our PKCE verifier to the in-app /desktop-auth
// page, which exchanges them for a session cookie via the `desktop` provider.
function handleOAuthCallback(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== `${PROTOCOL_NAME}:`) return;

  const code = parsed.searchParams.get("code");
  const state = parsed.searchParams.get("state");

  // Reject unless it matches an in-flight login. `state` is anti-forgery only
  // (not a secret), so a plain compare is fine; the real protection is PKCE.
  if (!pendingLogin || !code || !state || state !== pendingLogin.state) {
    console.error("[Electron] Rejected auth callback: no matching pending login");
    pendingLogin = null;
    return;
  }

  const { verifier } = pendingLogin;
  pendingLogin = null;

  // Stash the redeemable pair for the page to fetch over IPC — deliberately NOT
  // in the URL (keeps the verifier out of access logs / history / Referer).
  pendingAuth = { code, verifier };

  if (mainWindow) {
    void mainWindow.loadURL(`${appBaseUrl()}/desktop-auth`);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

// Setup session for OAuth
function setupSession(): void {
  // Allow cookies for OAuth
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    callback({ requestHeaders: details.requestHeaders });
  });

  // Clear cache on startup in development
  if (isDev) {
    void session.defaultSession.clearCache();
  }
}

// App lifecycle
void app.whenReady().then(() => {
  setupProtocolHandler();
  setupSession();

  // Renderer asks us to start sign-in (see preload `startLogin`).
  ipcMain.handle("desktop:start-login", () => {
    startDesktopLogin();
  });

  // The /desktop-auth page fetches the one-time {code, verifier} here instead of
  // reading it from its URL. One-shot: hand it over once, then drop it.
  ipcMain.handle("desktop:get-pending-auth", () => {
    const pair = pendingAuth;
    pendingAuth = null;
    return pair;
  });

  createWindow();

  app.on("activate", () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  // On macOS, keep app running until explicitly quit
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Handle second instance (for Windows/Linux protocol handling)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    // Protocol URL is in the last argument
    const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (url) {
      handleOAuthCallback(url);
    }

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

// Security: Prevent new window creation
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
});
