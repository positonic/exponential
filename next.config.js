/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { withSentryConfig } from "@sentry/nextjs";

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
    turbo: {
      resolveAlias: {
        "markdown-it": "markdown-it/dist/index.cjs.js",
      },
    },
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
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
