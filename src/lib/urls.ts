import { headers } from 'next/headers';

/** exponential.im's own URL. Only ever returned on Vercel, where production runs. */
const VERCEL_PRODUCTION_URL = 'https://www.exponential.im';

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/** An env var's value, with unset and empty treated alike. */
function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

/**
 * Resolve the public base URL from environment config only.
 *
 * Safe in any context (build-time metadata, cron jobs, background workers,
 * email senders) because it never touches request headers. Resolution order:
 *
 * 1. `NEXT_PUBLIC_APP_URL`
 * 2. `https://www.exponential.im`, but only on Vercel (`VERCEL` set)
 * 3. `NEXTAUTH_URL`
 * 4. `https://${RAILWAY_PUBLIC_DOMAIN}`
 * 5. `http://localhost:${PORT ?? 3000}`
 *
 * An install that is not on Vercel never resolves to exponential.im. That is
 * a security property, not a default: the agent-run dispatch kick POSTs
 * `CRON_SECRET` to this URL.
 */
export function getPublicBaseUrlFromEnv(): string {
  const appUrl = readEnv('NEXT_PUBLIC_APP_URL');
  if (appUrl) return stripTrailingSlash(appUrl);
  if (readEnv('VERCEL')) return VERCEL_PRODUCTION_URL;
  const authUrl = readEnv('NEXTAUTH_URL');
  if (authUrl) return stripTrailingSlash(authUrl);
  const railwayDomain = readEnv('RAILWAY_PUBLIC_DOMAIN');
  if (railwayDomain) return `https://${railwayDomain}`;
  return `http://localhost:${readEnv('PORT') ?? '3000'}`;
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
