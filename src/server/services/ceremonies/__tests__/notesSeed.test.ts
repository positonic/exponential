import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import type { JSONContent } from "@tiptap/core";
import { docToMarkdown, markdownToDoc } from "~/lib/prd/codec";

const triggerPageEmbedding = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/embedding/EmbeddingTriggerService", () => ({
  getEmbeddingTriggerService: () => ({ triggerPageEmbedding }),
}));

import {
  appendMeetingSummaryToNotes,
  buildNotesSeed,
  buildNotesSeedMarkdown,
  demoteHeadings,
  ensureSeededOccurrenceNotesPage,
  seedNotesPageIfUntouched,
  summaryToMarkdown,
} from "../notesSeed";
import type { AgendaSnapshot } from "../agenda/types";

const agenda: AgendaSnapshot = {
  version: 1,
  generatedAt: "2026-09-08T06:00:00.000Z",
  sections: [
    { key: "blockers", type: "blockers", title: "Blockers", items: [] },
    { key: "carried", type: "carried_over", title: "Carried over", items: [] },
    { key: "okr", type: "okr_review", title: "Key results at risk", items: [] },
  ],
  narrative: "The meeting needs to get through one key result at risk.\n\n## Blockers\nNothing to raise.\n\n## Key results at risk\n- Linked work renders (never checked in)",
};

/** A deep Prisma mock whose interactive `$transaction` runs on the same mock. */
function mockDb() {
  const db = mockDeep<PrismaClient>();
  db.$transaction.mockImplementation(((fn: (tx: PrismaClient) => unknown) => fn(db)) as never);
  return db;
}

const occurrence = { id: "occ-1", workspaceId: "ws-1", scheduledStart: new Date("2026-09-08T07:00:00.000Z") };
const ceremony = { name: "Daily Standup", timezone: "Europe/Berlin", ownerId: "u-owner", projects: [] };

const headingsOf = (doc: JSONContent) =>
  (doc.content ?? [])
    .filter((n) => n.type === "heading")
    .map((n) => [n.attrs?.level, (n.content ?? []).map((c) => c.text).join("")]);

beforeEach(() => triggerPageEmbedding.mockClear());

describe("buildNotesSeed", () => {
  it("writes one heading per section in order, then the narrative under Draft agenda with its headings demoted", () => {
    const md = buildNotesSeedMarkdown(agenda);
    expect(md).toBe(
      [
        "## Blockers",
        "## Carried over",
        "## Key results at risk",
        "## Draft agenda",
        "The meeting needs to get through one key result at risk.\n\n### Blockers\nNothing to raise.\n\n### Key results at risk\n- Linked work renders (never checked in)",
      ].join("\n\n"),
    );
    const seed = buildNotesSeed(agenda);
    expect(headingsOf(seed.bodyDoc)).toEqual([
      [2, "Blockers"],
      [2, "Carried over"],
      [2, "Key results at risk"],
      [2, "Draft agenda"],
      [3, "Blockers"],
      [3, "Key results at risk"],
    ]);
  });

  it("keeps the Markdown projection in step with the doc (round-trips through the codec)", () => {
    const seed = buildNotesSeed(agenda);
    expect(docToMarkdown(seed.bodyDoc)).toBe(seed.body);
    expect(markdownToDoc(seed.body)).toEqual(seed.bodyDoc);
  });

  it("omits Draft agenda when there is no narrative", () => {
    const md = buildNotesSeedMarkdown({ ...agenda, narrative: null });
    expect(md).toBe("## Blockers\n\n## Carried over\n\n## Key results at risk");
  });

  it("demotes headings only at line starts", () => {
    expect(demoteHeadings("# A\ntext with # inside\n#### D")).toBe("## A\ntext with # inside\n##### D");
  });
});

describe("seedNotesPageIfUntouched", () => {
  const seed = buildNotesSeed(agenda);

  it("seeds an empty page with a compare-and-set on docVersion 0", async () => {
    const db = mockDb();
    db.knowledgePage.findUnique.mockResolvedValue({ docVersion: 0, body: null, bodyDoc: null } as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 });
    expect(await seedNotesPageIfUntouched(db, "page-1", seed)).toBe(true);
    expect(db.knowledgePage.updateMany).toHaveBeenCalledWith({
      where: { id: "page-1", docVersion: 0 },
      data: { bodyDoc: seed.bodyDoc, body: seed.body, docVersion: { increment: 1 } },
    });
    expect(triggerPageEmbedding).toHaveBeenCalledWith("page-1");
  });

  it("treats the editor's empty doc as untouched, but never touches a saved or written page", async () => {
    const db = mockDb();
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 });
    db.knowledgePage.findUnique.mockResolvedValueOnce({ docVersion: 0, body: "", bodyDoc: { type: "doc", content: [{ type: "paragraph" }] } } as never);
    expect(await seedNotesPageIfUntouched(db, "page-1", seed)).toBe(true);

    db.knowledgePage.findUnique.mockResolvedValueOnce({ docVersion: 3, body: "", bodyDoc: null } as never);
    expect(await seedNotesPageIfUntouched(db, "page-1", seed)).toBe(false);
    db.knowledgePage.findUnique.mockResolvedValueOnce({ docVersion: 0, body: "My own notes", bodyDoc: null } as never);
    expect(await seedNotesPageIfUntouched(db, "page-1", seed)).toBe(false);
    db.knowledgePage.findUnique.mockResolvedValueOnce({ docVersion: 0, body: null, bodyDoc: markdownToDoc("typed") } as never);
    expect(await seedNotesPageIfUntouched(db, "page-1", seed)).toBe(false);
    expect(db.knowledgePage.updateMany).toHaveBeenCalledTimes(1);
  });

  it("yields to a save that lands between the read and the write", async () => {
    const db = mockDb();
    db.knowledgePage.findUnique.mockResolvedValue({ docVersion: 0, body: null, bodyDoc: null } as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 0 });
    expect(await seedNotesPageIfUntouched(db, "page-1", seed)).toBe(false);
    expect(triggerPageEmbedding).not.toHaveBeenCalled();
  });
});

describe("ensureSeededOccurrenceNotesPage", () => {
  it("creates the page with the seed on first generation and indexes it", async () => {
    const db = mockDb();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: null } as never);
    db.knowledgePage.create.mockResolvedValue({ id: "page-1" } as never);
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 1 });
    const res = await ensureSeededOccurrenceNotesPage(db, occurrence, ceremony, agenda);
    expect(res).toEqual({ pageId: "page-1", created: true, seeded: true });
    const seed = buildNotesSeed(agenda);
    expect(db.knowledgePage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bodyDoc: seed.bodyDoc, body: seed.body }) }),
    );
    expect(triggerPageEmbedding).toHaveBeenCalledWith("page-1");
  });

  it("on regeneration leaves an edited page alone (seed once only)", async () => {
    const db = mockDb();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: "page-1" } as never);
    db.knowledgePage.findUnique.mockResolvedValue({ docVersion: 4, body: "Edited by hand", bodyDoc: markdownToDoc("Edited by hand") } as never);
    const res = await ensureSeededOccurrenceNotesPage(db, occurrence, ceremony, { ...agenda, narrative: "Regenerated pre-read" });
    expect(res).toEqual({ pageId: "page-1", created: false, seeded: false });
    expect(db.knowledgePage.create).not.toHaveBeenCalled();
    expect(db.knowledgePage.updateMany).not.toHaveBeenCalled();
  });
});

describe("summaryToMarkdown", () => {
  it("renders the Fireflies JSON as overview + breakdown, falling back to bullets and to raw prose", () => {
    const json = JSON.stringify({
      overview: "Short standup.",
      detailed_breakdown: "## Blockers\n- Accordion review picked up by Pat",
      shorthand_bullet: ["one", "two"],
    });
    expect(summaryToMarkdown(json)).toBe("Short standup.\n\n### Blockers\n- Accordion review picked up by Pat");
    expect(summaryToMarkdown(JSON.stringify({ overview: "Only bullets.", shorthand_bullet: ["one", "two"] }))).toBe(
      "Only bullets.\n\n- one\n- two",
    );
    expect(summaryToMarkdown("Plain prose summary")).toBe("Plain prose summary");
    expect(summaryToMarkdown("")).toBe("");
    expect(summaryToMarkdown(null)).toBe("");
  });
});

describe("appendMeetingSummaryToNotes", () => {
  const existing = markdownToDoc("## Blockers\n\nWe talked.");

  it("appends a Meeting summary section with a compare-and-set on the version read, and keeps body = doc", async () => {
    const db = mockDb();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: "page-1" } as never);
    db.knowledgePage.findUnique.mockResolvedValue({ bodyDoc: existing, body: "## Blockers\n\nWe talked.", docVersion: 2 } as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 });

    const res = await appendMeetingSummaryToNotes(db, "occ-1", "Short standup.\n\n- Blocker cleared");

    expect(res).toEqual({ appended: true, pageId: "page-1", docVersion: 3 });
    const call = db.knowledgePage.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "page-1", docVersion: 2 });
    const data = call.data as { bodyDoc: JSONContent; body: string; docVersion: { increment: number } };
    expect(headingsOf(data.bodyDoc)).toEqual([
      [2, "Blockers"],
      [2, "Meeting summary"],
    ]);
    expect(data.body).toBe(docToMarkdown(data.bodyDoc));
    expect(data.body.endsWith("## Meeting summary\n\nShort standup.\n\n- Blocker cleared")).toBe(true);
    expect(data.docVersion).toEqual({ increment: 1 });
    expect(triggerPageEmbedding).toHaveBeenCalledWith("page-1");
  });

  it("retries once against a fresh read on a version conflict, then reports the conflict", async () => {
    const db = mockDb();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: "page-1" } as never);
    db.knowledgePage.findUnique
      .mockResolvedValueOnce({ bodyDoc: existing, body: "", docVersion: 2 } as never)
      .mockResolvedValueOnce({ bodyDoc: markdownToDoc("Someone typed more"), body: "", docVersion: 3 } as never);
    db.knowledgePage.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });

    const res = await appendMeetingSummaryToNotes(db, "occ-1", "Summary");

    expect(res).toEqual({ appended: true, pageId: "page-1", docVersion: 4 });
    expect(db.knowledgePage.findUnique).toHaveBeenCalledTimes(2);
    const second = db.knowledgePage.updateMany.mock.calls[1]![0];
    expect(second.where).toEqual({ id: "page-1", docVersion: 3 });
    expect((second.data as { body: string }).body).toContain("Someone typed more");

    db.knowledgePage.findUnique.mockResolvedValue({ bodyDoc: existing, body: "", docVersion: 5 } as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 0 });
    expect(await appendMeetingSummaryToNotes(db, "occ-1", "Summary")).toEqual({ appended: false, reason: "conflict" });
  });

  it("derives the doc from Markdown when the page has never been opened, and drops the blank paragraph of an empty page", async () => {
    const db = mockDb();
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: "page-1" } as never);
    db.knowledgePage.updateMany.mockResolvedValue({ count: 1 });
    db.knowledgePage.findUnique.mockResolvedValueOnce({ bodyDoc: null, body: "## Blockers\n\nText", docVersion: 0 } as never);
    await appendMeetingSummaryToNotes(db, "occ-1", "Summary");
    let data = db.knowledgePage.updateMany.mock.calls[0]![0].data as { bodyDoc: JSONContent; body: string };
    expect(headingsOf(data.bodyDoc)).toEqual([[2, "Blockers"], [2, "Meeting summary"]]);

    db.knowledgePage.findUnique.mockResolvedValueOnce({ bodyDoc: { type: "doc", content: [{ type: "paragraph" }] }, body: "", docVersion: 0 } as never);
    await appendMeetingSummaryToNotes(db, "occ-1", "Summary");
    data = db.knowledgePage.updateMany.mock.calls[1]![0].data as { bodyDoc: JSONContent; body: string };
    expect(data.bodyDoc.content?.[0]?.type).toBe("heading");
    expect(data.body).toBe("## Meeting summary\n\nSummary");
  });

  it("is a no-op without a page, without a summary, or when the section is already there", async () => {
    const db = mockDb();
    expect(await appendMeetingSummaryToNotes(db, "occ-1", "  ")).toEqual({ appended: false, reason: "empty-summary" });
    db.ceremonyOccurrence.findUnique.mockResolvedValueOnce({ notesPageId: null } as never);
    expect(await appendMeetingSummaryToNotes(db, "occ-1", "Summary")).toEqual({ appended: false, reason: "no-page" });
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ notesPageId: "page-1" } as never);
    db.knowledgePage.findUnique.mockResolvedValue({ bodyDoc: markdownToDoc("## Meeting summary\n\nDone"), body: "", docVersion: 1 } as never);
    expect(await appendMeetingSummaryToNotes(db, "occ-1", "Summary")).toEqual({ appended: false, reason: "already-appended" });
    expect(db.knowledgePage.updateMany).not.toHaveBeenCalled();
  });
});
