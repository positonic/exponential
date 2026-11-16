import * as Sentry from "@sentry/nextjs";
import {
  DENY_URLS,
  IGNORE_ERRORS,
  beforeSendClient,
} from "~/lib/sentry/clientNoise";
import { installStaleChunkReload } from "~/lib/sentry/staleChunkReload";

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
    // Browser-extension and dropped-network noise; see clientNoise.ts.
    ignoreErrors: IGNORE_ERRORS,
    denyUrls: DENY_URLS,
    beforeSend: beforeSendClient,
  });
}

// A tab left open across a deploy reloads once onto the new build instead
// of sitting on a broken page.
installStaleChunkReload();

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
