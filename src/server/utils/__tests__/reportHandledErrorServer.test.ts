import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { runAfterResponse, ingestSentryBug } = vi.hoisted(() => ({
  runAfterResponse: vi.fn<(task: () => Promise<unknown>) => void>(),
  ingestSentryBug: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/utils/runAfterResponse", () => ({ runAfterResponse }));
vi.mock("~/server/services/sentry/SentryBugService", () => ({ ingestSentryBug }));

import { reportHandledErrorServer } from "../reportHandledErrorServer";

describe("reportHandledErrorServer", () => {
  beforeEach(() => {
    vi.stubEnv("CLIENT_ERROR_BUGS", "1");
    runAfterResponse.mockReset();
    ingestSentryBug.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("files the bug ticket through runAfterResponse, not as a bare floating promise", async () => {
    ingestSentryBug.mockResolvedValue(undefined);

    reportHandledErrorServer(new Error("boom"), { area: "test.area" });

    // Nothing is filed until the platform runs the after-response task.
    expect(ingestSentryBug).not.toHaveBeenCalled();
    expect(runAfterResponse).toHaveBeenCalledTimes(1);

    const task = runAfterResponse.mock.calls[0]![0];
    await task();
    expect(ingestSentryBug).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed filing so the task never rejects", async () => {
    ingestSentryBug.mockRejectedValue(new Error("db down"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    reportHandledErrorServer(new Error("boom"), { area: "test.area" });
    const task = runAfterResponse.mock.calls[0]![0];

    await expect(task()).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("schedules nothing when bug filing is switched off", () => {
    vi.stubEnv("CLIENT_ERROR_BUGS", "");

    reportHandledErrorServer(new Error("boom"), { area: "test.area" });

    expect(runAfterResponse).not.toHaveBeenCalled();
  });
});
