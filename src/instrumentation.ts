import * as Sentry from "@sentry/nextjs";

export async function register() {
  // Never initialize during `next build`: each static-generation worker
  // would load the full SDK (+OpenTelemetry) and OOM the build container.
  // Runtime servers initialize normally.
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv !== "production" && vercelEnv !== "preview") return;
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
