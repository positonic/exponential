import { describe, expect, it, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { syncProjectCeremonies } from "../projectCeremonies";

describe("syncProjectCeremonies", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("links the wanted ceremonies and unlinks the rest", async () => {
    db.ceremony.count.mockResolvedValue(2);
    db.ceremony.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 2 });

    const result = await syncProjectCeremonies(db as unknown as PrismaClient, {
      projectId: "p-1",
      workspaceId: "ws-1",
      ceremonyIds: ["c-1", "c-2", "c-2"],
    });

    expect(result).toEqual({ linked: 2, unlinked: 1 });
    expect(db.ceremony.count).toHaveBeenCalledWith({
      where: { id: { in: ["c-1", "c-2"] }, workspaceId: "ws-1" },
    });
    expect(db.ceremony.updateMany).toHaveBeenNthCalledWith(1, {
      where: { projectId: "p-1", id: { notIn: ["c-1", "c-2"] } },
      data: { projectId: null },
    });
    // Must not filter on projectId: a never-linked ceremony has a NULL
    // projectId, and Prisma's `not` excludes NULL rows.
    expect(db.ceremony.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ["c-1", "c-2"] } },
      data: { projectId: "p-1" },
    });
  });

  it("an empty list unlinks everything and links nothing", async () => {
    db.ceremony.updateMany.mockResolvedValueOnce({ count: 3 });

    const result = await syncProjectCeremonies(db as unknown as PrismaClient, {
      projectId: "p-1",
      workspaceId: "ws-1",
      ceremonyIds: [],
    });

    expect(result).toEqual({ linked: 0, unlinked: 3 });
    expect(db.ceremony.count).not.toHaveBeenCalled();
    expect(db.ceremony.updateMany).toHaveBeenCalledTimes(1);
  });

  it("refuses ceremonies outside the project's workspace", async () => {
    db.ceremony.count.mockResolvedValue(1);
    await expect(
      syncProjectCeremonies(db as unknown as PrismaClient, {
        projectId: "p-1",
        workspaceId: "ws-1",
        ceremonyIds: ["c-1", "c-other"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.ceremony.updateMany).not.toHaveBeenCalled();
  });

  it("refuses to link ceremonies to a project with no workspace", async () => {
    await expect(
      syncProjectCeremonies(db as unknown as PrismaClient, {
        projectId: "p-1",
        workspaceId: null,
        ceremonyIds: ["c-1"],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
