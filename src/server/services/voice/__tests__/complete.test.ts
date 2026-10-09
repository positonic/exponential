/**
 * `completeAction`'s confirmed path over a mocked Prisma client and a mocked
 * Action write module: what the voice layer asks the module for, and how
 * each module outcome becomes a spoken reply.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

vi.mock("~/server/services/actions", () => ({
  applyActionUpdate: vi.fn(async () => ({ action: {}, previous: {}, transitions: {} })),
}));
vi.mock("~/server/services/voice/actionResolver", () => ({
  resolveActionByDescription: vi.fn(),
}));

import { applyActionUpdate } from "~/server/services/actions";
import { completeAction } from "../complete";

const USER = "user-1";

describe("completeAction (confirmed, pinned id)", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    vi.mocked(applyActionUpdate).mockClear();
    vi.mocked(applyActionUpdate).mockResolvedValue({ action: {}, previous: {}, transitions: {} } as never);
  });

  function stubCandidate(kanbanStatus: string | null) {
    db.action.findFirst.mockResolvedValue({ id: "a1", name: "Update the website", kanbanStatus } as never);
  }

  it("completes through the module and moves a board card to DONE alongside the status", async () => {
    stubCandidate("IN_PROGRESS");

    const res = await completeAction("update the website", USER, db, {
      confirm: true,
      pendingId: "a1",
      workspaceId: "w1",
    });

    expect(applyActionUpdate).toHaveBeenCalledWith(
      { db, actor: { userId: USER, isAdmin: false } },
      "a1",
      { status: "COMPLETED", kanbanStatus: "DONE" },
    );
    expect(res.needsConfirmation).toBe(false);
    expect(res.structured).toMatchObject({ resolution: "one", completed: true, id: "a1" });
    expect(res.speakable.toLowerCase()).toContain("done");
    // The candidate lookup is scoped to the session workspace and to rows not yet done.
    const where = db.action.findFirst.mock.calls[0]![0]!.where as { AND: unknown[] };
    expect(where.AND).toEqual(
      expect.arrayContaining([{ id: "a1" }, { status: { notIn: ["COMPLETED", "DELETED"] } }, { workspaceId: "w1" }]),
    );
  });

  it("sends no column for an action that is not on a board", async () => {
    stubCandidate(null);

    await completeAction("x", USER, db, { confirm: true, pendingId: "a1" });

    expect(applyActionUpdate).toHaveBeenCalledWith(expect.anything(), "a1", { status: "COMPLETED" });
  });

  it("answers read-only access as a spoken refusal, not a failed turn", async () => {
    stubCandidate("TODO");
    vi.mocked(applyActionUpdate).mockRejectedValueOnce(new TRPCError({ code: "FORBIDDEN", message: "no" }));

    const res = await completeAction("x", USER, db, { confirm: true, pendingId: "a1" });

    expect(res.structured).toMatchObject({ resolution: "one", completed: false, id: "a1", error: "forbidden" });
    expect(res.speakable.toLowerCase()).toContain("read-only");
  });

  it("answers a row that vanished between lookup and write as 'may already be done'", async () => {
    stubCandidate("TODO");
    vi.mocked(applyActionUpdate).mockRejectedValueOnce(new TRPCError({ code: "NOT_FOUND", message: "gone" }));

    const res = await completeAction("x", USER, db, { confirm: true, pendingId: "a1" });

    expect(res.structured).toMatchObject({ resolution: "one", completed: false, id: "a1" });
    expect(res.speakable.toLowerCase()).toContain("already be done");
  });

  it("does not write when nothing matches the pinned id within the user's access", async () => {
    db.action.findFirst.mockResolvedValue(null);

    const res = await completeAction("x", USER, db, { confirm: true, pendingId: "a-missing" });

    expect(applyActionUpdate).not.toHaveBeenCalled();
    expect(res.structured).toMatchObject({ completed: false });
  });

  it("rethrows anything that is not a gate or a vanished row", async () => {
    stubCandidate("TODO");
    vi.mocked(applyActionUpdate).mockRejectedValueOnce(new Error("db down"));

    await expect(completeAction("x", USER, db, { confirm: true, pendingId: "a1" })).rejects.toThrow("db down");
  });
});
