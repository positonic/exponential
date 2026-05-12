import * as Sentry from "@sentry/nextjs";

if (process.env.NEXT_PUBLIC_VERCEL_ENV === "production") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
