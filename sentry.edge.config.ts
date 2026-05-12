import * as Sentry from "@sentry/nextjs";

if (process.env.VERCEL_ENV === "production") {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
  });
}
