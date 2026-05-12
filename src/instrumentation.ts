import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.VERCEL_ENV !== "production") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
