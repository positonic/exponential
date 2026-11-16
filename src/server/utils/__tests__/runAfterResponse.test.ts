// @vitest-environment node
/**
 * `runAfterResponseReported` replaces `void task().catch(console.error)` on
 * request paths: the task goes to `after()` (Vercel `waitUntil`) so the
 * function stays alive until it settles, and a rejection is reported to
 * `reportHandledErrorServer` instead of being dropped.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { afterMock, reportMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: reportMock }));

import { runAfterResponseReported } from "../runAfterResponse";

function scheduledTask(): () => Promise<unknown> {
  const task = afterMock.mock.calls.at(-1)?.[0] as (() => Promise<unknown>) | undefined;
  if (!task) throw new Error("nothing was handed to after()");
  return task;
}

describe("runAfterResponseReported", () => {
  beforeEach(() => {
    afterMock.mockReset();
    reportMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("hands the task to after() instead of starting it detached", async () => {
    const task = vi.fn(async () => "done");

    runAfterResponseReported("test.area", task);

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(task).not.toHaveBeenCalled();
    await scheduledTask()();
    expect(task).toHaveBeenCalledTimes(1);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("the after() task settles only once the work has settled", async () => {
    let settle: () => void = () => undefined;
    runAfterResponseReported("test.area", () => new Promise<void>((resolve) => { settle = resolve; }));

    let done = false;
    const running = scheduledTask()().then(() => { done = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);

    settle();
    await running;
    expect(done).toBe(true);
  });

  it("reports a rejection with its area and context, and never rethrows", async () => {
    const boom = new Error("boom");
    runAfterResponseReported("test.area", async () => { throw boom; }, { id: "x1" });

    await expect(scheduledTask()()).resolves.toBeUndefined();
    expect(reportMock).toHaveBeenCalledWith(boom, { area: "test.area", context: { id: "x1" } });
    expect(console.error).toHaveBeenCalled();
  });

  it("outside a request scope (after() throws) still runs and reports", async () => {
    afterMock.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    const boom = new Error("boom");

    runAfterResponseReported("test.area", async () => { throw boom; });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reportMock).toHaveBeenCalledWith(boom, { area: "test.area", context: undefined });
  });
});
