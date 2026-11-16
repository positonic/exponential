import type { ErrorEvent } from "@sentry/nextjs";

/**
 * Browser errors the client SDK drops before they reach Sentry. Each entry is
 * an exact-message regex for something we cannot act on: injected browser /
 * extension code, or a fetch the network killed. Keep them anchored and
 * narrow so a real bug with a similar message still reports.
 *
 * Sentry tests each pattern against both the bare message and
 * "<Type>: <message>", so the optional type prefixes below cover both forms.
 */
export const IGNORE_ERRORS: RegExp[] = [
  // Firefox for iOS injects a reader-mode script that throws on our pages.
  /^(TypeError: )?undefined is not an object \(evaluating 'window\.__firefox__\.reader/,
  // MetaMask's injected provider failing to reach its extension.
  /^(\w+: )?Failed to connect to MetaMask$/,
  // A browser extension's messaging port closed under it.
  /^(Error: )?Attempting to use a disconnected port object$/,
  // Fetch failed at the network layer (offline, connection dropped, tab
  // suspended). Safari says "Load failed" (newer versions append the host),
  // Firefox "NetworkError…", Chromium/WebKit "network error". The same
  // failures surface through tRPC as TRPCClientError.
  /^(TypeError: |TRPCClientError: )?Load failed( \([^)]*\))?$/,
  /^(Error: |NetworkError: )?(NetworkError: )?A network error occurred\.$/,
  /^(TypeError: )?network error$/,
  // A fetch aborted by navigation / unmount (Safari's wording).
  /^(AbortError: )?Fetch is aborted$/,
  // A promise rejected with a bare {code, message} object: the shape wallet
  // providers (EIP-1193) and extensions use. Nothing in our code rejects
  // with that shape; real errors are Error instances and still report.
  /^(UnhandledRejection: )?Object captured as promise rejection with keys: code, message$/,
  // Something appended a second root element to `document` itself, which
  // React never does: an extension or translator injecting markup.
  /^(HierarchyRequestError: )?Failed to execute 'appendChild' on 'Node': Only one element on document allowed\.$/,
];

/** Errors whose stack starts inside a browser extension or injected script. */
export const DENY_URLS: RegExp[] = [
  /^(chrome|moz|safari|safari-web|ms-browser)-extension:\/\//,
  /^webkit-masked-url:\/\//,
];

const WEBPACK_CALL_MESSAGE = /^Cannot read properties of undefined \(reading 'call'\)$/;
const WEBPACK_RUNTIME_FRAME = /\/_next\/static\/chunks\/webpack-[\w-]+\.js/;

/**
 * "Cannot read properties of undefined (reading 'call')" thrown from the
 * webpack runtime means `__webpack_require__` asked for a module id the
 * loaded chunks don't contain: a tab still running the previous deploy's
 * runtime loaded a chunk from the new one. Only that runtime-origin form is
 * treated as stale-deploy noise; the same message from app code still reports.
 */
export function isStaleDeployModuleError(event: ErrorEvent): boolean {
  const exception = event.exception?.values?.[0];
  if (exception?.type !== "TypeError") return false;
  if (!WEBPACK_CALL_MESSAGE.test(exception.value ?? "")) return false;
  const frames = exception.stacktrace?.frames ?? [];
  // Sentry orders frames oldest-first; the throwing frame is last.
  const top = frames[frames.length - 1];
  if (!top) return false;
  return (
    top.function === "__webpack_require__" ||
    WEBPACK_RUNTIME_FRAME.test(top.filename ?? "")
  );
}

/** `beforeSend` for the browser SDK: drops noise the static lists can't express. */
export function beforeSendClient(event: ErrorEvent): ErrorEvent | null {
  if (isStaleDeployModuleError(event)) return null;
  return event;
}
