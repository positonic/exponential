import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

const generateMock = vi.hoisted(() => vi.fn());
vi.mock("../generate", () => ({ generateWorkspaceUpdate: generateMock }));

import { runDueWorkspaceUpdates } from "../runner";

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
