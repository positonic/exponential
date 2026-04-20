import { headers } from 'next/headers';

const PROD_FALLBACK = 'https://www.exponential.im';

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Resolve the public base URL from environment config only.
 *
 * Safe in any context (build-time metadata, cron jobs, background workers,
 * email senders) because it never touches request headers. Reads
 * `NEXT_PUBLIC_APP_URL` and falls back to the production URL.
 */
export function getPublicBaseUrlFromEnv(): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl && envUrl.length > 0) return stripTrailingSlash(envUrl);
  return PROD_FALLBACK;
}

/**
 * Resolve the public base URL from the current request's `Host` / `X-Forwarded-*`
 * headers. Must be called from a request-scoped server context (Route Handler,
 * Server Component, Server Action). Falls back to env-based resolution when
 * headers are unavailable or incomplete.
 */
export async function getPublicBaseUrl(): Promise<string> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    if (!host) return getPublicBaseUrlFromEnv();
    const proto =
      h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  } catch {
    return getPublicBaseUrlFromEnv();
  }
}
