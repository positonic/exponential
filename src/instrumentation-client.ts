import * as Sentry from "@sentry/nextjs";

import { initPostHogBrowser } from "~/lib/analytics/posthogBrowser";

const vercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;

// Report from production AND preview deploys; local dev stays silent.
if (vercelEnv === "production" || vercelEnv === "preview") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: vercelEnv,
    // Errors are always captured — this rate only samples performance traces.
    tracesSampleRate: vercelEnv === "production" ? 0.1 : 1.0,
    sendDefaultPii: false,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  });
}

// Page views and session replay. A no-op unless NEXT_PUBLIC_POSTHOG_KEY is set
// (it is only set on Vercel production), so local dev stays silent by default.
initPostHogBrowser(process.env.NEXT_PUBLIC_POSTHOG_KEY);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
