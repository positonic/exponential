import * as Sentry from "@sentry/nextjs";

export async function register() {
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
