/**
 * Save queue — serializes autosaves so a tab can never race itself (ADR-0024).
 *
 * The rich-doc editor fires saves from several triggers (typing debounce, blur,
 * explicit flush). Without serialization, two overlapping requests both carry
 * the `docVersion` read before either landed, and the server's stale-write
 * guard rejects the second as a CONFLICT — a phantom "someone else edited"
 * dialog with only one tab open.
 *
 * `request()` runs `run` after every previously queued run has settled, so it
 * reads fresh state (current doc, current version) when it actually executes.
 * Requests made while a run is already queued coalesce into that single
 * trailing run. `flush()` resolves once everything queued so far has settled.
 *
 * `run` must never reject — the editor's save fn catches its own errors (the
 * conflict modal handles them). A rejection would poison the chain.
 */
export interface SaveQueue {
  /** Queue a run after any in-flight one; coalesces with an already-queued run. */
  request: () => Promise<void>;
  /** Resolves once all runs queued so far have settled. */
  flush: () => Promise<void>;
}

export function createSaveQueue(run: () => Promise<void>): SaveQueue {
  let chain: Promise<void> = Promise.resolve();
  let queued = false;

  const request = (): Promise<void> => {
    if (queued) return chain;
    queued = true;
    chain = chain.then(() => {
      queued = false;
      return run();
    });
    return chain;
  };

  return { request, flush: () => chain };
}
