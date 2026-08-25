/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { withSentryConfig } from "@sentry/nextjs";

/**
 * CSP rollout (ticket crisp.clover) is two-stage:
 *
 * 1. NOW — an **enforcing** header carrying only directives that cannot break
 *    the app (`frame-ancestors`, `object-src`, `base-uri`; none of the app's
 *    markup uses <object>/<base>, and frame-ancestors mirrors the existing
 *    X-Frame-Options: SAMEORIGIN), plus a **Report-Only** header with the
 *    full policy so real traffic surfaces every violation in Sentry without
 *    ever blocking a user.
 * 2. LATER — after the report-only soak shows no false positives, move the
 *    full policy into the enforcing header (and tighten script-src towards
 *    nonces once off 'unsafe-inline').
 *
 * `script-src 'unsafe-inline'` is required by Next.js's inline bootstrap
 * scripts until a nonce strategy is adopted; 'unsafe-eval' is dev-only
 * (eval sourcemaps). Origins listed: Google Analytics (@next/third-parties),
 * the OpenAI realtime voice session, and Loom embeds. Sentry and Vercel
 * Analytics both go through same-origin paths (/monitoring tunnel,
 * /_vercel/insights), so 'self' covers them.
 */
const isDev = process.env.NODE_ENV !== "production";

/**
 * Sentry ingests CSP violation reports on its `security` endpoint, derived
 * from the public DSN (https://<key>@<host>/<projectId>).
 */
function sentryCspReportUri() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!url.username || !projectId) return null;
    return `https://${url.host}/api/${projectId}/security/?sentry_key=${url.username}`;
  } catch {
    return null;
  }
}

function contentSecurityPolicyReportOnly() {
  const reportUri = sentryCspReportUri();
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline'",
    // Published pages and CRM avatars embed images from arbitrary origins.
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.openai.com wss://api.openai.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "media-src 'self' blob: data: https:",
    "frame-src 'self' https://www.loom.com https://www.youtube.com https://www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (reportUri) directives.push(`report-uri ${reportUri}`);
  return directives.join("; ");
}

// Enforced from day one: nothing in the app can trip these, and
// frame-ancestors deliberately agrees with X-Frame-Options: SAMEORIGIN.
// (frame-ancestors is ignored in Report-Only headers, so it must live here.)
const CSP_ENFORCED =
  "frame-ancestors 'self'; object-src 'none'; base-uri 'self'";

/** @type {import("next").NextConfig} */
const config = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  experimental: {
    // Keep the build inside Vercel's 8GB container: source-map emission
    // raised webpack's footprint, and static-gen workers inherit the raised
    // NODE_OPTIONS heap cap, so bound both.
    webpackMemoryOptimizations: true,
    cpus: 2,
  },
  turbopack: {
    resolveAlias: {
      "markdown-it": "markdown-it/dist/index.cjs.js",
    },
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Content-Security-Policy', value: CSP_ENFORCED },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: contentSecurityPolicyReportOnly(),
          },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default withSentryConfig(config, {
  // Source-map upload happens only when SENTRY_AUTH_TOKEN is set (Vercel
  // build env). Without it the plugin logs a warning and the build still
  // succeeds — but production stack traces stay minified.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  // Upload a wider set of source maps so server-component and vendored
  // frames symbolicate too.
  widenClientFileUpload: true,
  // Don't ship source maps to the public — delete them after upload.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  // Proxy browser events through /monitoring so ad blockers can't drop them.
  tunnelRoute: "/monitoring",
  // Strip Sentry debug-logger calls from client bundles.
  disableLogger: true,
  telemetry: false,
  // Create Sentry cron monitors for the vercel.json crons so silent cron
  // failures become visible.
  automaticVercelMonitors: true,
});
