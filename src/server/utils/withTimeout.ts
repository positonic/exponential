/**
 * Bound a promise so a hung dependency can't eat the whole serverless budget.
 *
 * Several server paths (the voice brain passthrough, Google Calendar) await
 * external calls — a separate agent service, Google's OAuth + Calendar APIs —
 * that have no client-side timeout of their own. On Vercel those run inside a
 * 60s function; if the dependency stalls, the function is killed at the wall and
 * the caller sees an opaque "Task timed out" with no chance to render a graceful
 * fallback. Wrapping the await in `withTimeout` makes it reject FAST with a
 * labelled `TimeoutError` instead, so the caller can recover.
 *
 * Note: this rejects the wrapper, it does not cancel the underlying work. For
 * calls that accept an AbortSignal (fetch, gaxios), prefer also passing a signal
 * so the socket is actually torn down. This is the belt for everything else.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
