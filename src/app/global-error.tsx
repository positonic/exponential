"use client";

import "~/styles/globals.css";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the route-group root
 * layouts themselves. Must render its own <html>/<body> because it replaces
 * the entire tree.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" data-mantine-color-scheme="dark">
      <body className="bg-background-primary">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
          <h1 className="text-xl font-semibold text-text-primary">
            Something went wrong
          </h1>
          <p className="max-w-md text-sm text-text-secondary">
            The error has been reported automatically.
            {error.digest ? ` Reference: ${error.digest}` : ""}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-border-primary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
          >
            Reload page
          </button>
        </div>
      </body>
    </html>
  );
}
