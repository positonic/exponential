import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import {
  ensureOccurrenceNotesPage,
  formatNotesPageTitle,
  resolveNotesPageProjectId,
} from "../notesPage";

const occurrence = {
  id: "occ-1",
  workspaceId: "ws-1",
  scheduledStart: new Date("2026-09-08T07:00:00.000Z"),
};
const ceremony = {
  name: "Daily Standup",
  timezone: "Europe/Berlin",
  ownerId: "u-owner",
  projects: [{ projectId: "p-1" }],
};

describe("ensureOccurrenceNotesPage", () => {
  it("creates the page in the ceremony's project, owned by the ceremony owner, and links it", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: null } as never);
    db.knowledgePage.create.mockResolvedValue({ id: "page-1" } as never);
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 1 });

    const res = await ensureOccurrenceNotesPage(db, occurrence, ceremony);

    expect(res).toEqual({ pageId: "page-1", created: true });
    expect(db.knowledgePage.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "ws-1",
        projectId: "p-1",
        // "Sept" or "Sep" depending on the ICU build.
        title: expect.stringMatching(/^Daily Standup — 8 Sept? 2026$/),
        createdById: "u-owner",
        includeInSearch: true,
      },
      select: { id: true },
    });
    expect(db.ceremonyOccurrence.updateMany).toHaveBeenCalledWith({
      where: { id: "occ-1", notesPageId: null },
      data: { notesPageId: "page-1" },
    });
  });

  it("is idempotent: an occurrence that already has a page keeps it and nothing is written", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: "page-existing" } as never);
    const res = await ensureOccurrenceNotesPage(db, occurrence, ceremony);
    expect(res).toEqual({ pageId: "page-existing", created: false });
    expect(db.knowledgePage.create).not.toHaveBeenCalled();
    expect(db.ceremonyOccurrence.updateMany).not.toHaveBeenCalled();
  });

  it("on a concurrent create, drops its orphan page and adopts the winner's", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique
      .mockResolvedValueOnce({ notesPageId: null } as never) // our read: no page yet
      .mockResolvedValueOnce({ notesPageId: "page-winner" } as never); // after losing the CAS
    db.knowledgePage.create.mockResolvedValue({ id: "page-loser" } as never);
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 0 });
    db.knowledgePage.delete.mockResolvedValue({} as never);

    const res = await ensureOccurrenceNotesPage(db, occurrence, ceremony);

    expect(res).toEqual({ pageId: "page-winner", created: false });
    expect(db.knowledgePage.delete).toHaveBeenCalledWith({ where: { id: "page-loser" } });
  });

  it("passes seed content through to the created page", async () => {
    const db = mockDeep<PrismaClient>();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: null } as never);
    db.knowledgePage.create.mockResolvedValue({ id: "page-1" } as never);
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 1 });
    const seed = { bodyDoc: { type: "doc", content: [] }, body: "" };

    await ensureOccurrenceNotesPage(db, occurrence, ceremony, { seed });

    expect(db.knowledgePage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bodyDoc: seed.bodyDoc, body: "" }) }),
    );
  });
});

describe("resolveNotesPageProjectId", () => {
  it("places the page in the project only when the ceremony has exactly one", () => {
    expect(resolveNotesPageProjectId([{ projectId: "p-1" }])).toBe("p-1");
    expect(resolveNotesPageProjectId([])).toBeNull();
    expect(resolveNotesPageProjectId([{ projectId: "p-1" }, { projectId: "p-2" }])).toBeNull();
  });
});

describe("formatNotesPageTitle", () => {
  it("formats the date in the ceremony's zone", () => {
    // 23:30 UTC on the 8th is already the 9th in Berlin.
    expect(formatNotesPageTitle("Retro", new Date("2026-09-08T23:30:00.000Z"), "Europe/Berlin")).toMatch(/^Retro — 9 Sept? 2026$/);
  });
  it("falls back to the ISO date on an invalid zone", () => {
    expect(formatNotesPageTitle("Retro", new Date("2026-09-08T23:30:00.000Z"), "Not/AZone")).toBe("Retro — 2026-09-08");
  });
});
