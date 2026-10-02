import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

import {
  DISTRIBUTION_LEASE_MS,
  distributeWorkspaceUpdate,
  outcome,
  publicChannel,
  type DistributeChannels,
} from "../distribute";

const db = mockDeep<PrismaClient>();

function approvedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "upd-1",
    status: "APPROVED",
    approvedTitle: "Bulk edit lands",
    approvedBody: "# Bulk edit lands\n\nEdit many tickets at once.",
    approvedById: "owner-1",
    deliveries: null,
    workspace: {
      id: "ws-1",
      slug: "acme",
      name: "Acme",
      updateConfig: { isPublic: true, newsletterCollectionId: "list-1" },
    },
    ...overrides,
  };
}

function channels(overrides: Partial<DistributeChannels> = {}): DistributeChannels {
  return {
    public: publicChannel,
    email: vi.fn().mockResolvedValue(outcome("done", "sent 3")),
    matrix: vi.fn().mockResolvedValue(outcome("done", "posted")),
    ...overrides,
  };
}

beforeEach(() => {
  mockReset(db);
  db.workspaceUpdate.updateMany.mockResolvedValue({ count: 1 });
});

describe("distributeWorkspaceUpdate", () => {
  it("sends the approved snapshot to every channel and marks the update SENT", async () => {
    db.workspaceUpdate.findUnique.mockResolvedValue(approvedRow() as never);
    const ch = channels();

    const result = await distributeWorkspaceUpdate(db, "upd-1", ch);

    expect(result.kind).toBe("sent");
    expect(ch.email).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Bulk edit lands", body: "# Bulk edit lands\n\nEdit many tickets at once." }),
    );
    const claimedAt = db.workspaceUpdate.updateMany.mock.calls[0]![0].data.distributionAttemptAt as Date;
    expect(db.workspaceUpdate.updateMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: "upd-1",
        status: "APPROVED",
        OR: [
          { distributionAttemptAt: null },
          { distributionAttemptAt: { lt: new Date(claimedAt.getTime() - DISTRIBUTION_LEASE_MS) } },
        ],
      },
      data: { distributionAttemptAt: claimedAt },
    });
    // The outcome is only written while this attempt still holds the lease.
    expect(db.workspaceUpdate.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: "upd-1", status: "APPROVED", distributionAttemptAt: claimedAt },
      data: expect.objectContaining({
        status: "SENT",
        sentAt: expect.any(Date),
        deliveries: expect.objectContaining({
          public: expect.objectContaining({ status: "done" }),
          email: expect.objectContaining({ status: "done" }),
          matrix: expect.objectContaining({ status: "done" }),
        }),
      }),
    });
  });

  it("keeps a failed channel for the next sweep without repeating finished ones", async () => {
    db.workspaceUpdate.findUnique.mockResolvedValue(
      approvedRow({ deliveries: { email: { status: "done", at: "x" }, public: { status: "done", at: "x" } } }) as never,
    );
    const ch = channels({ matrix: vi.fn().mockRejectedValue(new Error("room is encrypted")) });

    const result = await distributeWorkspaceUpdate(db, "upd-1", ch);

    expect(result.kind).toBe("partial");
    expect(ch.email).not.toHaveBeenCalled();
    const data = db.workspaceUpdate.updateMany.mock.calls[1]![0].data as Record<string, unknown>;
    expect(data.status).toBeUndefined();
    expect(data.deliveries).toMatchObject({ matrix: { status: "failed", detail: "room is encrypted" } });
  });

  it("does nothing for an update that is not approved", async () => {
    db.workspaceUpdate.updateMany.mockResolvedValueOnce({ count: 0 });
    db.workspaceUpdate.findUnique.mockResolvedValue({ status: "DRAFT" } as never);
    const ch = channels();

    expect(await distributeWorkspaceUpdate(db, "upd-1", ch)).toEqual({ kind: "not-approved" });
    expect(ch.email).not.toHaveBeenCalled();
    expect(db.workspaceUpdate.updateMany).toHaveBeenCalledTimes(1);
  });

  it("sends nothing while another attempt holds the lease", async () => {
    db.workspaceUpdate.updateMany.mockResolvedValueOnce({ count: 0 });
    db.workspaceUpdate.findUnique.mockResolvedValue({ status: "APPROVED" } as never);
    const ch = channels();

    expect(await distributeWorkspaceUpdate(db, "upd-1", ch)).toEqual({ kind: "busy" });
    expect(ch.email).not.toHaveBeenCalled();
    expect(ch.matrix).not.toHaveBeenCalled();
    expect(db.workspaceUpdate.updateMany).toHaveBeenCalledTimes(1);
  });

  it("skips the public page for a workspace that is not public", async () => {
    const result = await publicChannel({
      id: "u",
      workspaceId: "w",
      workspaceSlug: "acme",
      workspaceName: "Acme",
      title: "t",
      body: "b",
      approvedById: null,
      config: { isPublic: false, newsletterCollectionId: null },
    });
    expect(result.status).toBe("skipped");
  });
});
