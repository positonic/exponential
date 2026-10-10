/**
 * "Waiting for a runner" (Agent PRD V2): a LOCAL_CLI run still QUEUED ten
 * minutes after creation, and nothing else. Pure helper shared by the pill
 * and the Delegated tab.
 */
import { describe, it, expect } from "vitest";
import { isWaitingForRunner } from "../presentation";
import { WAITING_FOR_RUNNER_AFTER_MS } from "../constants";

const now = new Date("2026-10-10T12:00:00Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

describe("isWaitingForRunner", () => {
  it("is true for a LOCAL_CLI run QUEUED for at least ten minutes", () => {
    expect(isWaitingForRunner({ status: "QUEUED", executor: "LOCAL_CLI", createdAt: ago(WAITING_FOR_RUNNER_AFTER_MS) }, now)).toBe(true);
    expect(isWaitingForRunner({ status: "QUEUED", executor: "LOCAL_CLI", createdAt: ago(60 * 60 * 1000) }, now)).toBe(true);
  });

  it("is false while the ten minutes have not elapsed", () => {
    expect(isWaitingForRunner({ status: "QUEUED", executor: "LOCAL_CLI", createdAt: ago(WAITING_FOR_RUNNER_AFTER_MS - 1) }, now)).toBe(false);
    expect(isWaitingForRunner({ status: "QUEUED", executor: "LOCAL_CLI", createdAt: now }, now)).toBe(false);
  });

  it("never applies to a MASTRA run — the dispatcher and the cron sweep own that queue", () => {
    expect(isWaitingForRunner({ status: "QUEUED", executor: "MASTRA", createdAt: ago(60 * 60 * 1000) }, now)).toBe(false);
  });

  it("never applies once the run has been claimed or finished", () => {
    for (const status of ["RUNNING", "SUCCEEDED", "FAILED", "WAITING_ON_OWNER", "CANCELLED", "TIMED_OUT"] as const) {
      expect(isWaitingForRunner({ status, executor: "LOCAL_CLI", createdAt: ago(60 * 60 * 1000) }, now)).toBe(false);
    }
  });

  it("defaults `now` to the wall clock", () => {
    expect(isWaitingForRunner({ status: "QUEUED", executor: "LOCAL_CLI", createdAt: new Date(Date.now() - 2 * WAITING_FOR_RUNNER_AFTER_MS) })).toBe(true);
    expect(isWaitingForRunner({ status: "QUEUED", executor: "LOCAL_CLI", createdAt: new Date() })).toBe(false);
  });
});
