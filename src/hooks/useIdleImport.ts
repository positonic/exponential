"use client";

import { useEffect, useState } from "react";
import { reportHandledError } from "~/lib/reportHandledError";

/**
 * Loads code that isn't needed for the page's first render — a closed modal's
 * form, a drawer's body — outside the page's initial JavaScript.
 *
 * The import starts when the page goes idle, so the UI is usually ready before
 * anyone asks for it, or immediately once `neededNow` turns true. The result is
 * held in state rather than behind `React.lazy`/`next/dynamic`, because a lazy
 * component suspends on its first render even when its chunk has already
 * loaded, which would flash a loading state every first time it opens.
 *
 * A failed import (a flaky network, a stale chunk after a deploy) is reported
 * and retried the next time `neededNow` turns true.
 *
 * @param load A stable, module-level loader, e.g. `() => import("./Form")`.
 * @param area Identifies the caller in error reports.
 */
export function useIdleImport<T>(
  load: () => Promise<T>,
  neededNow: boolean,
  area: string,
): { value: T | null; failed: boolean } {
  // Wrapped in an object: a loaded React component is itself a function, which
  // useState would otherwise call as an updater.
  const [loaded, setLoaded] = useState<{ value: T } | null>(null);
  const [attempt, setAttempt] = useState(neededNow ? 1 : 0);
  const [failed, setFailed] = useState(false);
  const [wasNeeded, setWasNeeded] = useState(neededNow);

  if (neededNow !== wasNeeded) {
    setWasNeeded(neededNow);
    if (neededNow && !loaded && (attempt === 0 || failed)) {
      setFailed(false);
      setAttempt(attempt + 1);
    }
  }

  useEffect(() => {
    const request = () => setAttempt((current) => current || 1);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(request);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(request, 200);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (attempt === 0) return;
    let cancelled = false;
    load().then(
      (value) => {
        if (!cancelled) setLoaded({ value });
      },
      (error: unknown) => {
        reportHandledError(error, { area });
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
    // `load` and `area` are module-level constants at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return { value: loaded?.value ?? null, failed };
}
