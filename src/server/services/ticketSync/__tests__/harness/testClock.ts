/**
 * Deterministic-but-monotonic clock for round-trip sync tests.
 *
 * The engine stamps `lastPulledAt`/`startedAt` with the REAL `new Date()`, so a
 * purely fake epoch would put every simulated edit "before" the pull window and
 * silently exclude it. Instead the clock rides on real time plus a monotonic
 * offset: `advance()` moves strictly past anything the engine has stamped so
 * far, keeping edit ordering unambiguous without mocking global time.
 */
export class TestClock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  /** Move time forward (default 1s) and return the new now. */
  advance(ms = 1000): Date {
    this.offsetMs += ms;
    return this.now();
  }
}
