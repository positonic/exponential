import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

const generateMock = vi.hoisted(() => vi.fn());
vi.mock("../generate", () => ({ generateWorkspaceUpdate: generateMock }));
const distributeMock = vi.hoisted(() => vi.fn());
vi.mock("../distribute", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../distribute")>()),
  distributeWorkspaceUpdate: distributeMock,
}));

import { DISTRIBUTION_LEASE_MS } from "../distribute";
import { DISTRIBUTION_RETRY_WINDOW_MS, runDueWorkspaceUpdates, runPendingDistributions } from "../runner";

const db = mockDeep<PrismaClient>();
const deps = { writer: { write: vi.fn() }, notify: vi.fn(), baseUrl: "https://app.test" };
const NOW = new Date("2026-10-02T09:30:00.000Z"); // Friday
const enabledAt = new Date("2026-01-01T00:00:00.000Z");

beforeEach(() => {
  mockReset(db);
  generateMock.mockReset();
  db.workspaceUpdate.findUnique.mockResolvedValue(null);
  db.workspaceUpdate.findFirst.mockResolvedValue({ windowEnd: new Date("2026-09-25T09:00:00.000Z") } as never);
});

describe("runDueWorkspaceUpdates", () => {
  it("drafts due workspaces with a window tiling from the previous update", async () => {
    db.workspaceUpdateConfig.findMany.mockResolvedValue([
      { workspaceId: "ws-due", weekday: 5, hour: 9, timezone: "UTC", enabledAt },
      { workspaceId: "ws-monday", weekday: 1, hour: 9, timezone: "UTC", enabledAt },
    ] as never);
    generateMock.mockResolvedValue({ kind: "drafted", updateId: "u", pageId: "p" });

    const result = await runDueWorkspaceUpdates(db, NOW, () => deps);

    expect(result).toMatchObject({ evaluated: 2, due: 1, drafted: ["ws-due"], failed: [] });
    expect(generateMock).toHaveBeenCalledTimes(1);
    expect(generateMock.mock.calls[0]![1]).toEqual({
      workspaceId: "ws-due",
      kind: "weekly",
      periodKey: "2026-10-02",
      windowStart: new Date("2026-09-25T09:00:00.000Z"),
      windowEnd: new Date("2026-10-02T09:00:00.000Z"),
      actorUserId: null,
    });
  });

  it("skips a period that already has its update", async () => {
    db.workspaceUpdateConfig.findMany.mockResolvedValue([
      { workspaceId: "ws-due", weekday: 5, hour: 9, timezone: "UTC", enabledAt },
    ] as never);
    db.workspaceUpdate.findUnique.mockResolvedValue({ id: "existing" } as never);

    const result = await runDueWorkspaceUpdates(db, NOW, () => deps);

    expect(result.due).toBe(0);
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("isolates one workspace's failure (including a bad timezone) from the rest", async () => {
    db.workspaceUpdateConfig.findMany.mockResolvedValue([
      { workspaceId: "ws-bad-tz", weekday: 5, hour: 9, timezone: "Mars/Olympus", enabledAt },
      { workspaceId: "ws-throws", weekday: 5, hour: 9, timezone: "UTC", enabledAt },
      { workspaceId: "ws-ok", weekday: 5, hour: 9, timezone: "UTC", enabledAt },
    ] as never);
    generateMock
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ kind: "empty", updateId: "u" });

    const result = await runDueWorkspaceUpdates(db, NOW, () => deps);

    expect(result.empty).toEqual(["ws-ok"]);
    expect(result.failed.map((f) => f.workspaceId)).toEqual(["ws-bad-tz", "ws-throws"]);
  });
});

describe("runPendingDistributions", () => {
  const channels = { public: vi.fn(), email: vi.fn(), matrix: vi.fn() };

  it("retries unleased approved updates inside the window, least recently tried first", async () => {
    db.workspaceUpdate.findMany.mockResolvedValue([
      { id: "u-sent" },
      { id: "u-partial" },
      { id: "u-busy" },
      { id: "u-boom" },
    ] as never);
    distributeMock
      .mockResolvedValueOnce({ kind: "sent", deliveries: {} })
      .mockResolvedValueOnce({ kind: "partial", deliveries: {} })
      .mockResolvedValueOnce({ kind: "busy" })
      .mockRejectedValueOnce(new Error("db down"));

    const result = await runPendingDistributions(db, NOW, channels);

    expect(result).toEqual({
      retried: 4,
      sent: ["u-sent"],
      stillFailing: ["u-partial"],
      busy: ["u-busy"],
      errored: [{ updateId: "u-boom", error: "db down" }],
    });
    expect(db.workspaceUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "APPROVED",
          approvedAt: { gte: new Date(NOW.getTime() - DISTRIBUTION_RETRY_WINDOW_MS) },
          OR: [
            { distributionAttemptAt: null },
            { distributionAttemptAt: { lt: new Date(NOW.getTime() - DISTRIBUTION_LEASE_MS) } },
          ],
        },
        orderBy: { distributionAttemptAt: { sort: "asc", nulls: "first" } },
      }),
    );
  });
});
