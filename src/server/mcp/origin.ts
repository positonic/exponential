/**
 * The hosted MCP endpoint's Origin check (hosted MCP Agent PRD, D4 step 1).
 *
 * A server-side client (Claude Code, Cursor, a script) sends no `Origin`, and
 * continues. A browser always sends one, and it must be the app's own origin
 * or listed in `MCP_ALLOWED_ORIGINS`; anything else gets 403. This is the MCP
 * transport's DNS-rebinding guard: a page the person happens to have open can't
 * drive the endpoint. CORS headers go only to an allowed origin.
 *
 * The app's origin comes from env, never from the request (D1): a spoofed
 * `Host` must not widen the allowlist.
 */

import { env } from "~/env";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";

/**
 * `MCP_ALLOWED_ORIGINS`: comma-separated origins, each normalised through
 * `URL` (so a trailing slash or path is dropped). Entries that are not URLs
 * are ignored.
 */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .flatMap((entry) => {
      try {
        return [new URL(entry).origin];
      } catch {
        return [];
      }
    });
}

export type OriginCheck =
  | { allowed: true; /** The origin to echo in CORS headers; null when the request had none. */ corsOrigin: string | null }
  | { allowed: false };

export function checkOrigin(headers: Headers): OriginCheck {
  const origin = headers.get("origin");
  if (origin === null) return { allowed: true, corsOrigin: null };

  const allowed = new Set([
    new URL(getPublicBaseUrlFromEnv()).origin,
    ...parseAllowedOrigins(env.MCP_ALLOWED_ORIGINS),
  ]);
  return allowed.has(origin) ? { allowed: true, corsOrigin: origin } : { allowed: false };
}

/** CORS headers for a response to an allowed origin. */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (origin === null) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    // A browser client needs the challenge to start OAuth (V2).
    "Access-Control-Expose-Headers": "WWW-Authenticate",
    Vary: "Origin",
  };
}

/** Extra headers for a preflight (OPTIONS) from an allowed origin. */
export const PREFLIGHT_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "600",
};

/** The same response with extra headers set. */
export function withHeaders(res: Response, headers: Record<string, string>): Response {
  if (Object.keys(headers).length === 0) return res;
  const out = new Response(res.body, res);
  for (const [name, value] of Object.entries(headers)) out.headers.set(name, value);
  return out;
}
