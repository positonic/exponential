import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import * as Sentry from "@sentry/nextjs";

/**
 * Shared rate limiting that survives serverless scale-out (ADR-0030 /
 * ADR-0036: Upstash is the endorsed store).
 *
 * Every earlier limiter in the app was an in-process `Map`, which on Vercel
 * means one window per warm lambda — the effective limit is the configured
 * limit times the instance count, and it resets on every cold start. This
 * helper centralises the pattern:
 *
 * - **Upstash configured** (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`):
 *   sliding-window limits shared by all instances. This is the production mode.
 * - **Not configured**: an in-memory fixed-window fallback — same behaviour as
 *   the old per-route Maps, fine for dev. In production this logs a warning
 *   once so a missing env var is visible instead of silently weakening limits.
 *
 * **Store outage fails open, deliberately.** If Upstash is unreachable the
 * check returns success rather than 500ing the route: every caller here is a
 * user-facing path (form submit, chat, error reporting, token issue) where
 * "briefly unlimited" is strictly better than "hard down", and the honeypot /
 * time-trap / auth defences on those paths still apply. Outages are reported
 * to Sentry so they are visible, not silent.
 */

export interface RateLimitResult {
  success: boolean;
  /** Seconds until the caller may retry; 0 when success. Use for Retry-After. */
  retryAfterSeconds: number;
}

interface RateLimitOptions {
  /** Limiter namespace, e.g. "forms-ip". Part of the Redis key prefix. */
  name: string;
  /** Identity inside the namespace: an IP, user id, or email. */
  key: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

function upstashRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return Redis.fromEnv();
}

// One Ratelimit instance per (name, limit, window) config, so repeated calls
// reuse the client and its ephemeral cache of already-blocked keys.
const limiters = new Map<string, Ratelimit>();

function upstashLimiter(opts: RateLimitOptions): Ratelimit | null {
  const redis = upstashRedis();
  if (!redis) return null;

  const cacheKey = `${opts.name}:${opts.limit}:${opts.windowSeconds}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(opts.limit, `${opts.windowSeconds} s`),
      prefix: `rl:${opts.name}`,
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

// In-memory fallback (dev, or prod before Upstash is provisioned). Fixed
// window per instance — the pre-existing behaviour of the per-route Maps.
type MemoryEntry = { count: number; resetAt: number };
const memoryWindows = new Map<string, MemoryEntry>();
let warnedNoStore = false;

if (typeof globalThis !== "undefined") {
  const cleanup = () => {
    const now = Date.now();
    for (const [key, entry] of memoryWindows.entries()) {
      if (now > entry.resetAt) memoryWindows.delete(key);
    }
  };
  setInterval(cleanup, 5 * 60_000).unref?.();
}

function memoryCheck(opts: RateLimitOptions): RateLimitResult {
  if (!warnedNoStore && process.env.NODE_ENV === "production") {
    warnedNoStore = true;
    console.warn(
      "[rateLimit] UPSTASH_REDIS_REST_URL/TOKEN not set — falling back to per-instance in-memory limits, which do not hold across serverless scale-out",
    );
  }
  const now = Date.now();
  const mapKey = `${opts.name}:${opts.key}`;
  const entry = memoryWindows.get(mapKey);
  if (!entry || now > entry.resetAt) {
    memoryWindows.set(mapKey, {
      count: 1,
      resetAt: now + opts.windowSeconds * 1000,
    });
    return { success: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count <= opts.limit) {
    return { success: true, retryAfterSeconds: 0 };
  }
  return {
    success: false,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

/**
 * Check (and consume) one request against the named limit.
 *
 * Never throws. On a store error the request is allowed (fail open, see
 * module doc) and the error is reported.
 */
export async function checkRateLimit(
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const limiter = upstashLimiter(opts);
  if (!limiter) return memoryCheck(opts);

  try {
    const result = await limiter.limit(opts.key);
    if (result.success) return { success: true, retryAfterSeconds: 0 };
    return {
      success: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((result.reset - Date.now()) / 1000),
      ),
    };
  } catch (error) {
    console.error(
      `[rateLimit] store check failed for ${opts.name} — failing open:`,
      error,
    );
    Sentry.captureException(error, {
      tags: { area: "rate-limit", limiter: opts.name },
    });
    return { success: true, retryAfterSeconds: 0 };
  }
}

/** Client IP as Vercel presents it; "unknown" groups requests with no header. */
export function clientIpFrom(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Standard 429 payload: JSON error plus a Retry-After header so well-behaved
 * clients can back off instead of failing silently.
 */
export function tooManyRequestsInit(
  result: RateLimitResult,
  extraHeaders?: Record<string, string>,
): { status: number; headers: Record<string, string> } {
  return {
    status: 429,
    headers: {
      "Retry-After": String(result.retryAfterSeconds || 60),
      ...extraHeaders,
    },
  };
}
