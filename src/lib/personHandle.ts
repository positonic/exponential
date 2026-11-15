/**
 * Person page handles: the opt-in vanity name in `/people/<handle>`.
 *
 * Pure rules, shared by the server (which enforces them) and the settings
 * field (which only previews them). A handle is 3 to 30 characters of lowercase
 * letters, digits and hyphens, starts and ends with a letter or digit, and is
 * unique across the whole install. Uniqueness and "humans only" are the
 * server's to check (`services/person/handle.ts`).
 */

export const HANDLE_MIN_LENGTH = 3;
export const HANDLE_MAX_LENGTH = 30;

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * The shape of a generated user id (a cuid). A handle may never look like one:
 * `/people/<segment>` is read as an id first, so such a handle could never be
 * reached, and could shadow an account created later.
 */
const USER_ID_PATTERN = /^c[a-z0-9]{24}$/;

/**
 * Words nobody may take: route-like names, roles that read as official, and
 * placeholders that would make a URL misleading.
 */
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  "about",
  "account",
  "admin",
  "administrator",
  "agent",
  "agents",
  "all",
  "anonymous",
  "api",
  "app",
  "assistant",
  "assistants",
  "billing",
  "bot",
  "everyone",
  "exponential",
  "help",
  "here",
  "login",
  "logout",
  "me",
  "new",
  "nobody",
  "null",
  "official",
  "owner",
  "people",
  "person",
  "root",
  "security",
  "self",
  "settings",
  "signin",
  "signup",
  "staff",
  "support",
  "system",
  "team",
  "teams",
  "undefined",
  "unknown",
  "user",
  "users",
  "workspace",
  "workspaces",
  "www",
  "you",
]);

export type HandleProblem = "length" | "characters" | "reserved";

export type HandleCheck =
  | { ok: true; handle: string }
  | { ok: false; problem: HandleProblem; message: string };

/** What the person typed, as it would be stored: trimmed and lowercased. */
export function normaliseHandle(input: string): string {
  return input.trim().toLowerCase();
}

/**
 * Check a handle against every rule that needs no database. The input is
 * normalised first, so `  James ` passes as `james`.
 */
export function checkHandle(input: string): HandleCheck {
  const handle = normaliseHandle(input);

  if (handle.length < HANDLE_MIN_LENGTH || handle.length > HANDLE_MAX_LENGTH) {
    return {
      ok: false,
      problem: "length",
      message: `A handle is ${HANDLE_MIN_LENGTH} to ${HANDLE_MAX_LENGTH} characters long.`,
    };
  }
  if (!HANDLE_PATTERN.test(handle)) {
    return {
      ok: false,
      problem: "characters",
      message:
        "A handle uses only letters, digits and hyphens, and starts and ends with a letter or digit.",
    };
  }
  if (RESERVED_HANDLES.has(handle) || USER_ID_PATTERN.test(handle)) {
    return {
      ok: false,
      problem: "reserved",
      message: "That handle is reserved. Pick another.",
    };
  }
  return { ok: true, handle };
}

/**
 * Whether a `/people/<segment>` route segment could be a handle at all. The
 * resolver uses it to skip the handle lookup for generated ids.
 */
export function couldBeHandle(segment: string): boolean {
  return checkHandle(segment).ok;
}
