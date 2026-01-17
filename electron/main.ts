import {
  app,
  BrowserWindow,
  shell,
  protocol,
  session,
} from "electron";
import path from "path";
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

// Handle OAuth callback URLs
function handleOAuthCallback(url: string): void {
  // Check if this is an OAuth callback
  if (url.startsWith(`${PROTOCOL_NAME}://`) || url.includes("/auth/callback")) {
    console.log("[Electron] OAuth callback received:", url);

    // Extract the callback path and query params
    const urlObj = new URL(url.replace(`${PROTOCOL_NAME}://`, "https://"));
    const callbackPath = urlObj.pathname + urlObj.search;

    // Navigate to the callback URL in the app
    if (mainWindow) {
      const baseUrl = isDev ? DEV_URL : PROD_URL;
      void mainWindow.loadURL(`${baseUrl}${callbackPath}`);
      mainWindow.focus();
    }
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
app.whenReady().then(() => {
  setupProtocolHandler();
  setupSession();
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
