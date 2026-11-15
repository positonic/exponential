import { after } from "next/server";

/**
 * Run `task` once the response has been sent, with the platform keeping the
 * function alive until it settles (`after()` is Vercel `waitUntil` under the
 * hood). A bare un-awaited promise can be frozen with the instance and
 * silently dropped.
 *
 * Outside a request scope (a script, a test, a job with no request) `after()`
 * throws, so the task runs detached there instead. `task` must handle its own
 * errors: nothing awaits it.
 */
export function runAfterResponse(task: () => Promise<unknown>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}
