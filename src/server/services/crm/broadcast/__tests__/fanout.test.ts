import { describe, it, expect, vi } from "vitest";

import { fanoutSend, isWholeBatchFailure } from "../fanout";

const r = (memberId: string, email: string | null = `${memberId}@x.io`) => ({
  memberId,
  email,
});

describe("fanoutSend", () => {
  it("sends to every eligible recipient", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await fanoutSend({
      recipients: [r("a"), r("b"), r("c")],
      alreadySent: new Set(),
      send,
    });
    expect(res).toMatchObject({ attempted: 3, sent: 3, failed: 0, skipped: 0 });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("isolates a per-recipient failure and continues", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("bad address"))
      .mockResolvedValueOnce(undefined);
    const res = await fanoutSend({
      recipients: [r("a"), r("b"), r("c")],
      alreadySent: new Set(),
      send,
    });
    expect(res.sent).toBe(2);
    expect(res.failed).toBe(1);
    expect(res.failures).toEqual([{ memberId: "b", error: "bad address" }]);
  });

  it("skips unmailable (no email) recipients without calling send", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await fanoutSend({
      recipients: [r("a"), r("b", null)],
      alreadySent: new Set(),
      send,
    });
    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("skips already-sent recipients (retry idempotency)", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const res = await fanoutSend({
      recipients: [r("a"), r("b")],
      alreadySent: new Set(["a"]),
      send,
    });
    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(1);
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ memberId: "a" }));
  });
});

describe("isWholeBatchFailure", () => {
  it("is true only when everyone attempted failed", () => {
    expect(isWholeBatchFailure({ attempted: 3, sent: 0, failed: 3, skipped: 0, failures: [] })).toBe(true);
    expect(isWholeBatchFailure({ attempted: 3, sent: 1, failed: 2, skipped: 0, failures: [] })).toBe(false);
    expect(isWholeBatchFailure({ attempted: 0, sent: 0, failed: 0, skipped: 5, failures: [] })).toBe(false);
  });
});
