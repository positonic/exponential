/**
 * After a deploy, a tab still running the previous build can request chunks
 * or module ids that no longer exist: webpack throws `ChunkLoadError`, or
 * "Cannot read properties of undefined (reading 'call')" from its runtime.
 * The page is broken at that point and a reload fetches the new build, so
 * reload — at most once per build per tab session. If the fresh page hits
 * the same error (a genuinely broken deploy, or the user is offline), the
 * guard holds and the page stays put rather than reload-looping and
 * discarding the user's input.
 *
 * Two entry points: global `error` / `unhandledrejection` listeners for
 * errors nothing caught, and `recoverFromStaleChunk` for the Next.js error
 * boundaries, which catch render-time errors before any global event fires.
 */

const STORAGE_KEY = "exp:stale-chunk-reloaded-build";

const CHUNK_LOAD_MESSAGE = /^Loading (CSS )?chunk [\w/-]+ failed/;
const WEBPACK_CALL_MESSAGE = /^Cannot read properties of undefined \(reading 'call'\)$/;
const WEBPACK_RUNTIME_FRAME = /__webpack_require__|\/_next\/static\/chunks\/webpack-/;

/**
 * The throwing frame of a stack string: the first line that is a frame
 * (V8 "    at fn (url)", or Firefox/Safari "fn@url"), skipping V8's leading
 * "<Type>: <message>" line.
 */
function topStackFrame(stack: string): string | null {
  for (const raw of stack.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("at ") || line.includes("@")) return line;
  }
  return null;
}

export function isStaleChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  if (CHUNK_LOAD_MESSAGE.test(error.message)) return true;
  // The 'call' TypeError only counts when the webpack runtime itself threw
  // it. App code that throws during module evaluation also has runtime
  // frames further down its stack, so only the top frame is checked — the
  // same rule clientNoise.ts uses to drop the event.
  if (!(error instanceof TypeError) || !WEBPACK_CALL_MESSAGE.test(error.message)) {
    return false;
  }
  const top = topStackFrame(error.stack ?? "");
  return top !== null && WEBPACK_RUNTIME_FRAME.test(top);
}

interface ReloadDeps {
  /** Identifies the running build; one reload is allowed per build. */
  buildId: string;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  reload: () => void;
}

/** Reloads unless this build already reloaded in this tab. Returns whether it reloaded. */
export function reloadOnceForStaleChunk(deps: ReloadDeps): boolean {
  // Without storage there is no loop guard, so leave the page alone
  // (private mode, sandboxed iframe, blocked site data).
  if (!deps.storage) return false;
  try {
    if (deps.storage.getItem(STORAGE_KEY) === deps.buildId) return false;
    deps.storage.setItem(STORAGE_KEY, deps.buildId);
  } catch {
    return false;
  }
  deps.reload();
  return true;
}

function browserReloadDeps(): ReloadDeps {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return {
    buildId: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "unknown",
    storage,
    reload: () => window.location.reload(),
  };
}

/**
 * For error boundaries: if `error` is a stale-chunk error, reload onto the
 * new build (once per build). Returns whether a reload was started.
 */
export function recoverFromStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined" || !isStaleChunkError(error)) return false;
  return reloadOnceForStaleChunk(browserReloadDeps());
}

export function installStaleChunkReload(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    recoverFromStaleChunk(event.error);
  });
  window.addEventListener("unhandledrejection", (event) => {
    recoverFromStaleChunk(event.reason);
  });
}
