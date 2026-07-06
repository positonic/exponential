import { describe, expect, it } from "vitest";
import { createSaveQueue } from "../save-queue";

/** A run whose completion the test controls. */
function controllableRun() {
  const resolvers: Array<() => void> = [];
  const events: string[] = [];
  let running = 0;
  let maxConcurrent = 0;
  let calls = 0;
  const run = () => {
    calls += 1;
    running += 1;
    maxConcurrent = Math.max(maxConcurrent, running);
    events.push(`start ${calls}`);
    const n = calls;
    return new Promise<void>((resolve) => {
      resolvers.push(() => {
        running -= 1;
        events.push(`end ${n}`);
        resolve();
      });
    });
  };
  const finishNext = async () => {
    resolvers.shift()?.();
    // Let the chained .then continuations flush.
    await Promise.resolve();
    await Promise.resolve();
  };
  return {
    run,
    finishNext,
    events,
    get calls() {
      return calls;
    },
    get maxConcurrent() {
      return maxConcurrent;
    },
  };
}

describe("createSaveQueue", () => {
  it("never runs two saves concurrently", async () => {
    const ctl = controllableRun();
    const queue = createSaveQueue(ctl.run);

    void queue.request();
    await Promise.resolve(); // first run starts
    void queue.request(); // requested while the first is in flight

    // Second request waits for the first, even though the first is in flight.
    expect(ctl.calls).toBe(1);
    await ctl.finishNext();
    expect(ctl.calls).toBe(2);
    await ctl.finishNext();
    expect(ctl.maxConcurrent).toBe(1);
    expect(ctl.events).toEqual(["start 1", "end 1", "start 2", "end 2"]);
  });

  it("coalesces requests made while a run is queued", async () => {
    const ctl = controllableRun();
    const queue = createSaveQueue(ctl.run);

    void queue.request(); // starts running
    await Promise.resolve();
    void queue.request(); // queued behind it
    void queue.request(); // coalesces into the queued run
    void queue.request(); // coalesces too

    await ctl.finishNext();
    await ctl.finishNext();
    await queue.flush();
    expect(ctl.calls).toBe(2);
  });

  it("flush resolves only after all queued runs settle", async () => {
    const ctl = controllableRun();
    const queue = createSaveQueue(ctl.run);

    void queue.request();
    await Promise.resolve();
    void queue.request();

    let flushed = false;
    void queue.flush().then(() => {
      flushed = true;
    });

    await ctl.finishNext();
    expect(flushed).toBe(false); // second run still in flight
    await ctl.finishNext();
    await Promise.resolve();
    expect(flushed).toBe(true);
  });

  it("a slow in-flight run holds back a later request", async () => {
    const ctl = controllableRun();
    const queue = createSaveQueue(ctl.run);

    void queue.request();
    await Promise.resolve();
    void queue.request();

    // First run stays pending across several ticks — the second must not start.
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(ctl.calls).toBe(1);

    await ctl.finishNext();
    expect(ctl.calls).toBe(2);
    await ctl.finishNext();
  });

  it("keeps accepting requests after previous runs complete", async () => {
    const ctl = controllableRun();
    const queue = createSaveQueue(ctl.run);

    void queue.request();
    await ctl.finishNext();
    expect(ctl.calls).toBe(1);

    void queue.request();
    await ctl.finishNext();
    expect(ctl.calls).toBe(2);
  });
});
