/**
 * Content-Security-Policy builders, imported by next.config.js.
 *
 * Plain ESM JavaScript (not TypeScript) because next.config.js loads it
 * directly, before any TypeScript compilation. Kept out of next.config.js so
 * the policy can be unit-tested.
 *
 * See the rollout note in next.config.js: the full policy ships as
 * Report-Only while the soak surfaces false positives in Sentry.
 */

/**
 * Sentry ingests CSP violation reports on its `security` endpoint, derived
 * from the public DSN (https://<key>@<host>/<projectId>).
 *
 * @param {string | undefined} dsn
 * @returns {string | null}
 */
export function sentryCspReportUri(dsn) {
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

/**
 * Origins the Vercel toolbar (comments / feedback widget) loads from. Vercel
 * injects it on preview deploys only, so production never allows them.
 * https://vercel.com/docs/vercel-toolbar/managing-toolbar#using-a-content-security-policy
 */
const VERCEL_TOOLBAR = {
  script: ["https://vercel.live"],
  style: ["https://vercel.live"],
  font: ["https://vercel.live", "https://assets.vercel.com"],
  connect: ["https://vercel.live", "wss://ws-us3.pusher.com"],
  frame: ["https://vercel.live"],
};

/**
 * @param {{ isDev: boolean, vercelEnv?: string, reportUri?: string | null }} options
 * @returns {string}
 */
export function contentSecurityPolicyReportOnly({ isDev, vercelEnv, reportUri }) {
  const preview = vercelEnv === "preview";
  /** @param {string[]} origins */
  const toolbar = (origins) => (preview ? ` ${origins.join(" ")}` : "");

  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://www.googletagmanager.com https://*.i.posthog.com${toolbar(VERCEL_TOOLBAR.script)}`,
    `style-src 'self' 'unsafe-inline'${toolbar(VERCEL_TOOLBAR.style)}`,
    // Published pages and CRM avatars embed images from arbitrary origins.
    "img-src 'self' blob: data: https:",
    `font-src 'self' data:${toolbar(VERCEL_TOOLBAR.font)}`,
    // www.google.com: GA4 (gtag) sends its collect/ccm beacons there as well as
    // to *.google-analytics.com.
    `connect-src 'self' https://api.openai.com wss://api.openai.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.google.com https://*.i.posthog.com${toolbar(VERCEL_TOOLBAR.connect)}`,
    "media-src 'self' blob: data: https:",
    `frame-src 'self' https://www.loom.com https://www.youtube.com https://www.youtube-nocookie.com${toolbar(VERCEL_TOOLBAR.frame)}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    // Both hostnames: a form on www can post to the apex (and vice versa),
    // which 'self' alone does not cover.
    "form-action 'self' https://exponential.im https://www.exponential.im",
  ];
  if (reportUri) directives.push(`report-uri ${reportUri}`);
  return directives.join("; ");
}
