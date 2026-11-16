// @vitest-environment node
/**
 * `emitAfterResponse` hands notification emits to `after()` (Vercel
 * `waitUntil`) so the function stays alive until they settle, instead of a
 * `void`ed promise the instance can freeze. Failures are reported to
 * `reportHandledErrorServer`, never dropped.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { afterMock, reportMock } = vi.hoisted(() => ({
  afterMock: vi.fn(),
  reportMock: vi.fn(),
}));

vi.mock("next/server", () => ({ after: afterMock }));
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: reportMock }));

import { emitAfterResponse } from "../emitAfterResponse";

/** The task most recently handed to `after()`. */
function scheduledTask(): () => Promise<unknown> {
  const task = afterMock.mock.calls.at(-1)?.[0] as (() => Promise<unknown>) | undefined;
  if (!task) throw new Error("nothing was handed to after()");
  return task;
}

describe("emitAfterResponse", () => {
  beforeEach(() => {
    afterMock.mockReset();
    reportMock.mockReset();
  });

  it("registers the emit with after() rather than starting a detached promise", async () => {
    const emit = vi.fn(async () => ["member1"]);

    emitAfterResponse("test.area", emit);

    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();

    await scheduledTask()();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(reportMock).not.toHaveBeenCalled();
  });

  it("the after() task only settles once the emit has settled", async () => {
    let settle: (value: string[]) => void = () => undefined;
    const emit = vi.fn(() => new Promise<string[]>((resolve) => { settle = resolve; }));
    emitAfterResponse("test.area", emit);

    let done = false;
    const running = scheduledTask()().then(() => { done = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(done).toBe(false);

    settle([]);
    await running;
    expect(done).toBe(true);
  });

  it("reports an emit that resolved null (emitNotification's failure signal)", async () => {
    emitAfterResponse("test.area", async () => null, { actionId: "a1" });
    await scheduledTask()();

    expect(reportMock).toHaveBeenCalledWith(expect.any(Error), {
      area: "test.area",
      context: { actionId: "a1" },
    });
  });

  it("reports an emit that threw, and never rethrows", async () => {
    const boom = new Error("boom");
    emitAfterResponse("test.area", async () => { throw boom; });

    await expect(scheduledTask()()).resolves.toBeUndefined();
    expect(reportMock).toHaveBeenCalledWith(boom, { area: "test.area", context: undefined });
  });

  it("outside a request scope (after() throws) still runs the emit", async () => {
    afterMock.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    const emit = vi.fn(async () => []);

    emitAfterResponse("test.area", emit);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(emit).toHaveBeenCalledTimes(1);
  });
});
