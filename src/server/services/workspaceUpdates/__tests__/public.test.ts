import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { getPublicUpdate, listPublicUpdates, stripLeadingHeadline } from "../public";

const db = mockDeep<PrismaClient>();

beforeEach(() => mockReset(db));

describe("public updates", () => {
  it("lists only approved snapshots of a workspace that opted in", async () => {
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      name: "Acme",
      slug: "acme",
      updateConfig: { isPublic: true, timezone: "UTC" },
    } as never);
    db.workspaceUpdate.findMany.mockResolvedValue([
      {
        id: "u1",
        kind: "weekly",
        approvedTitle: "Bulk edit lands",
        approvedBody: "# Bulk edit lands\n\n_Edit many tickets at once._",
        windowStart: new Date("2026-09-25"),
        windowEnd: new Date("2026-10-02"),
        approvedAt: new Date("2026-10-02T10:00:00Z"),
      },
    ] as never);

    const result = await listPublicUpdates(db, "acme");

    expect(result?.updates).toEqual([
      expect.objectContaining({ id: "u1", title: "Bulk edit lands", body: "_Edit many tickets at once._" }),
    ]);
    expect(db.workspaceUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", status: { in: ["APPROVED", "SENT"] }, approvedBody: { not: null } },
      }),
    );
  });

  it("returns nothing for a workspace that has not opted in", async () => {
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      name: "Acme",
      slug: "acme",
      updateConfig: { isPublic: false, timezone: "UTC" },
    } as never);

    expect(await listPublicUpdates(db, "acme")).toBeNull();
    expect(await getPublicUpdate(db, "acme", "u1")).toBeNull();
    expect(db.workspaceUpdate.findMany).not.toHaveBeenCalled();
  });

  it("strips only a leading headline", () => {
    expect(stripLeadingHeadline("# Title\n\nBody\n\n# Not leading")).toBe("Body\n\n# Not leading");
    expect(stripLeadingHeadline("Body only")).toBe("Body only");
  });
});
