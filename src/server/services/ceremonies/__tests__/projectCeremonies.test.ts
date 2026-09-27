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

  it("adds the wanted join rows and removes the project's other ones, leaving other projects' links alone", async () => {
    db.ceremony.count.mockResolvedValue(2);
    db.ceremonyProject.deleteMany.mockResolvedValue({ count: 1 });
    db.ceremonyProject.createMany.mockResolvedValue({ count: 2 });

    const result = await syncProjectCeremonies(db as unknown as PrismaClient, {
      projectId: "p-1",
      workspaceId: "ws-1",
      ceremonyIds: ["c-1", "c-2", "c-2"],
    });

    expect(result).toEqual({ linked: 2, unlinked: 1 });
    expect(db.ceremony.count).toHaveBeenCalledWith({
      where: { id: { in: ["c-1", "c-2"] }, workspaceId: "ws-1" },
    });
    // Only this project's rows are touched: the filter carries the projectId.
    expect(db.ceremonyProject.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "p-1", ceremonyId: { notIn: ["c-1", "c-2"] } },
    });
    expect(db.ceremonyProject.createMany).toHaveBeenCalledWith({
      data: [
        { ceremonyId: "c-1", projectId: "p-1" },
        { ceremonyId: "c-2", projectId: "p-1" },
      ],
      skipDuplicates: true,
    });
  });

  it("an empty list unlinks everything and links nothing", async () => {
    db.ceremonyProject.deleteMany.mockResolvedValue({ count: 3 });

    const result = await syncProjectCeremonies(db as unknown as PrismaClient, {
      projectId: "p-1",
      workspaceId: "ws-1",
      ceremonyIds: [],
    });

    expect(result).toEqual({ linked: 0, unlinked: 3 });
    expect(db.ceremony.count).not.toHaveBeenCalled();
    expect(db.ceremonyProject.deleteMany).toHaveBeenCalledWith({ where: { projectId: "p-1" } });
    expect(db.ceremonyProject.createMany).not.toHaveBeenCalled();
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
    expect(db.ceremonyProject.deleteMany).not.toHaveBeenCalled();
    expect(db.ceremonyProject.createMany).not.toHaveBeenCalled();
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
