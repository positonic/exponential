"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

interface SegmentErrorFallbackProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Shared fallback for Next.js `error.tsx` boundaries. Reports the error to
 * Sentry, then offers a retry. Deliberately dependency-free (no Mantine) so
 * it renders even when providers are broken.
 */
export function SegmentErrorFallback({
  error,
  reset,
}: SegmentErrorFallbackProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-xl font-semibold text-text-primary">
        Something went wrong
      </h2>
      <p className="max-w-md text-sm text-text-secondary">
        The error has been reported automatically.
        {error.digest ? ` Reference: ${error.digest}` : ""}
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-border-primary px-4 py-2 text-sm font-medium text-text-primary hover:bg-surface-hover"
      >
        Try again
      </button>
    </div>
  );
}
