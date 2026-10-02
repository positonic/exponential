import { beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep, mockReset } from "vitest-mock-extended";

import { getPublicUpdate, listPublicUpdates, parsePageParam, stripLeadingHeadline } from "../public";

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
    expect(result?.hasOlder).toBe(false);
    expect(db.workspaceUpdate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "ws-1", status: { in: ["APPROVED", "SENT"] }, approvedBody: { not: null } },
      }),
    );
  });

  it("pages through older updates so none drop off the index", async () => {
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-1",
      name: "Acme",
      slug: "acme",
      updateConfig: { isPublic: true, timezone: "UTC" },
    } as never);
    const row = (id: string) => ({
      id,
      kind: "weekly",
      approvedTitle: id,
      approvedBody: id,
      windowStart: new Date("2026-09-25"),
      windowEnd: new Date("2026-10-02"),
      approvedAt: new Date("2026-10-02T10:00:00Z"),
    });
    db.workspaceUpdate.findMany.mockResolvedValue([row("a"), row("b"), row("c")] as never);

    const result = await listPublicUpdates(db, "acme", { page: 3, pageSize: 2 });

    expect(result?.updates.map((u) => u.id)).toEqual(["a", "b"]);
    expect(result?.hasOlder).toBe(true);
    expect(db.workspaceUpdate.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 4, take: 3 }));
  });

  it("reads ?page= defensively", () => {
    expect(parsePageParam(undefined)).toBe(1);
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["2", "5"])).toBe(2);
    expect(parsePageParam("0")).toBe(1);
    expect(parsePageParam("-2")).toBe(1);
    expect(parsePageParam("1e9")).toBe(1);
    expect(parsePageParam("999999")).toBe(1000);
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
