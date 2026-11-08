import { describe, expect, it, vi, beforeEach } from "vitest";

// Page history (ADR-0074) has its own tests; here it only has to be called.
const recordPageRevision = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/pages/revisions", () => ({ recordPageRevision }));
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";

const appendMeetingSummaryToNotes = vi.hoisted(() => vi.fn());
vi.mock("../../notesSeed", () => ({ appendMeetingSummaryToNotes }));
const createAction = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/actions/createAction", () => ({ createAction }));
const applyActionUpdate = vi.hoisted(() => vi.fn());
vi.mock("~/server/services/actions/applyActionUpdate", () => ({ applyActionUpdate }));
const reportHandledErrorServer = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));

import { addAgendaItem, carryOverToNext, markOccurrenceCaptured, reorderAgendaItems, resolveAgendaItem, setAgendaItemResolved } from "../items";

const agenda = {
  version: 1,
  generatedAt: "x",
  sections: [
    { key: "blk", type: "blockers", title: "Blockers", items: [
      { id: "blk:action:a-1", sectionKey: "blk", title: "A", refType: "action", refId: "a-1", order: 0 },
      { id: "blk:action:a-2", sectionKey: "blk", title: "B", refType: "action", refId: "a-2", order: 1, resolvedAt: "2026-09-09T09:00:00Z" },
    ] },
  ],
};
const now = new Date("2026-09-10T08:00:00Z");

/** The helpers run inside a serializable transaction; in unit tests the callback just gets the mock. */
function withTx(db: ReturnType<typeof mockDeep<PrismaClient>>) {
  db.$transaction.mockImplementation(((fn: (tx: PrismaClient) => Promise<unknown>) => fn(db)) as never);
  return db;
}

describe("setAgendaItemResolved", () => {
  it("stamps resolvedAt on the item and persists the snapshot", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    const next = await setAgendaItemResolved(db, "occ-1", "blk:action:a-1", true, now);
    expect(next.sections[0]!.items[0]!.resolvedAt).toBe(now.toISOString());
    expect(db.ceremonyOccurrence.update).toHaveBeenCalledWith({ where: { id: "occ-1" }, data: { agenda: next } });
    const reopened = await setAgendaItemResolved(db, "occ-1", "blk:action:a-2", false, now);
    expect(reopened.sections[0]!.items[1]!.resolvedAt).toBeNull();
  });

  it("refuses unknown items and agenda-less occurrences", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda } as never);
    await expect(setAgendaItemResolved(db, "occ-1", "nope", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda: null } as never);
    await expect(setAgendaItemResolved(db, "occ-1", "blk:action:a-1", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("carryOverToNext", () => {
  it("seeds unresolved items into the next occurrence's carried_over section when it already has an agenda", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.action.findMany.mockResolvedValue([{ id: "a-1", status: "ACTIVE" }] as never);
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", ceremonyId: "cer-1", scheduledStart: now, agenda } as never);
    db.ceremonyOccurrence.findFirst.mockResolvedValue({
      id: "occ-2",
      agenda: { version: 1, generatedAt: "y", sections: [{ key: "carry", type: "carried_over", title: "Carried over", items: [], emptyReason: "Nothing to raise" }] },
    } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);

    expect(await carryOverToNext(db, "occ-1")).toBe(1);
    const data = db.ceremonyOccurrence.update.mock.calls[0]![0].data as { agenda: { sections: Array<{ items: Array<Record<string, unknown>>; emptyReason: unknown }> } };
    expect(data.agenda.sections[0]!.items).toEqual([
      expect.objectContaining({ id: "carry:carried:action:a-1", sectionKey: "carry", carriedFromOccurrenceId: "occ-1", resolvedAt: null }),
    ]);
    expect(data.agenda.sections[0]!.emptyReason).toBeNull();
    // Idempotent: seeding again adds nothing.
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-2", agenda: data.agenda } as never);
    expect(await carryOverToNext(db, "occ-1")).toBe(0);
  });

  it("does nothing when the next occurrence has no agenda yet (the section derives it at generation)", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.action.findMany.mockResolvedValue([{ id: "a-1", status: "ACTIVE" }] as never);
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", ceremonyId: "cer-1", scheduledStart: now, agenda } as never);
    db.ceremonyOccurrence.findFirst.mockResolvedValue({ id: "occ-2", agenda: null } as never);
    expect(await carryOverToNext(db, "occ-1")).toBe(0);
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });
});

describe("markOccurrenceCaptured", () => {
  beforeEach(() => {
    appendMeetingSummaryToNotes.mockReset();
    reportHandledErrorServer.mockReset();
  });

  it("appends the recording summary to the notes page after carry-over, and never lets that fail the capture", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 1 });
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", ceremonyId: "cer-1", scheduledStart: now, agenda: null } as never);
    appendMeetingSummaryToNotes.mockResolvedValue({ appended: true, pageId: "page-1", docVersion: 2 });
    expect(await markOccurrenceCaptured(db, "occ-1", { summaryMarkdown: "Short standup." })).toBe(true);
    expect(appendMeetingSummaryToNotes).toHaveBeenCalledWith(db, "occ-1", "Short standup.");

    // No summary → no append; a throwing append → capture still true, error reported.
    expect(await markOccurrenceCaptured(db, "occ-1")).toBe(true);
    expect(appendMeetingSummaryToNotes).toHaveBeenCalledTimes(1);
    appendMeetingSummaryToNotes.mockRejectedValue(new Error("page gone"));
    expect(await markOccurrenceCaptured(db, "occ-1", { summaryMarkdown: "x" })).toBe(true);
    expect(reportHandledErrorServer).toHaveBeenCalledTimes(1);

    // A twice-lost compare-and-set is reported rather than silently dropped.
    appendMeetingSummaryToNotes.mockResolvedValue({ appended: false, reason: "conflict" });
    expect(await markOccurrenceCaptured(db, "occ-1", { summaryMarkdown: "x" })).toBe(true);
    expect(reportHandledErrorServer).toHaveBeenCalledTimes(2);
  });

  it("moves only pre-meeting states to CAPTURED and then carries over; never throws", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 1 });
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ id: "occ-1", ceremonyId: "cer-1", scheduledStart: now, agenda: null } as never);
    expect(await markOccurrenceCaptured(db, "occ-1")).toBe(true);
    expect(db.ceremonyOccurrence.updateMany).toHaveBeenCalledWith({
      where: { id: "occ-1", status: { in: ["PLANNED", "AGENDA_CIRCULATED", "IN_PROGRESS"] } },
      data: { status: "CAPTURED" },
    });
    db.ceremonyOccurrence.updateMany.mockResolvedValue({ count: 0 });
    expect(await markOccurrenceCaptured(db, "occ-1")).toBe(false);
    db.ceremonyOccurrence.updateMany.mockRejectedValue(new Error("db down"));
    expect(await markOccurrenceCaptured(db, "occ-1")).toBe(false);
  });
});

describe("addAgendaItem / reorderAgendaItems", () => {
  it("adds a hand item tagged with the user and reorders a section", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda: JSON.parse(JSON.stringify(agenda)) } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    const added = await addAgendaItem(db, "occ-1", { sectionKey: "blk", title: "  Talk about hiring ", userId: "u-1" }, now);
    const items = added.sections[0]!.items;
    expect(items).toHaveLength(3);
    expect(items[2]).toMatchObject({ sectionKey: "blk", title: "Talk about hiring", refType: "text", addedByUserId: "u-1", order: 2 });
    // A hand edit is recorded so a send before it reads as "changed since".
    expect(added.editedAt).toBe(now.toISOString());
    await expect(addAgendaItem(db, "occ-1", { sectionKey: "nope", title: "x", userId: "u-1" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda: added } as never);
    const reordered = await reorderAgendaItems(db, "occ-1", { sectionKey: "blk", itemIds: [items[2]!.id, "blk:action:a-1"] });
    expect(reordered.sections[0]!.items.map((i) => [i.id, i.order])).toEqual([[items[2]!.id, 0], ["blk:action:a-1", 1], ["blk:action:a-2", 2]]);
  });
});

describe("addAgendaItem kinds", () => {
  const actor = { userId: "u-1", isAdmin: false };
  const occurrenceRow = (projects: string[]) => ({
    workspaceId: "ws-1",
    agenda: JSON.parse(JSON.stringify(agenda)),
    ceremony: { projects: projects.map((projectId) => ({ projectId })), workspace: { slug: "clear" } },
  });

  beforeEach(() => createAction.mockReset());

  it("treats a call without a kind as a note", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockResolvedValue({ agenda: JSON.parse(JSON.stringify(agenda)) } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    const res = await addAgendaItem(db, "occ-1", { sectionKey: "blk", title: "Risk: vendor", detail: "**late**", userId: "u-1" }, now);
    expect(res.sections[0]!.items[2]).toMatchObject({ refType: "text", title: "Risk: vendor", detail: "**late**" });
    expect(createAction).not.toHaveBeenCalled();
  });

  it("creates one Action in the ceremony's single project, linked to the occurrence, and references it", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique
      .mockResolvedValueOnce(occurrenceRow(["prj-1"]) as never)
      .mockResolvedValueOnce({ agenda: JSON.parse(JSON.stringify(agenda)) } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    createAction.mockResolvedValue({ id: "act-9" });
    const due = new Date("2026-11-14T00:00:00Z");

    const res = await addAgendaItem(
      db,
      "occ-1",
      { kind: "action", sectionKey: "blk", title: "Respond to stakeholders", detail: "revised metrics", userId: "u-1", assigneeId: "u-zineb", dueDate: due, actor },
      now,
    );

    expect(createAction).toHaveBeenCalledTimes(1);
    expect(createAction).toHaveBeenCalledWith(
      { db, actor },
      {
        name: "Respond to stakeholders",
        description: "revised metrics",
        source: "ceremony",
        workspaceId: "ws-1",
        projectId: "prj-1",
        assigneeIds: ["u-zineb"],
        dueDate: due,
        occurrenceId: "occ-1",
      },
    );
    expect(res.sections[0]!.items[2]).toMatchObject({
      refType: "action",
      refId: "act-9",
      href: "/w/clear/actions/act-9",
      addedByUserId: "u-1",
      title: "Respond to stakeholders",
    });
  });

  it("puts the Action in no project when the ceremony has several, and leaves it unassigned without an owner", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique
      .mockResolvedValueOnce(occurrenceRow(["prj-1", "prj-2"]) as never)
      .mockResolvedValueOnce({ agenda: JSON.parse(JSON.stringify(agenda)) } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    createAction.mockResolvedValue({ id: "act-10" });
    await addAgendaItem(db, "occ-1", { kind: "action", sectionKey: "blk", title: "Follow up", userId: "u-1", actor }, now);
    const input = createAction.mock.calls[0]![1] as Record<string, unknown>;
    expect(input).not.toHaveProperty("projectId");
    expect(input).not.toHaveProperty("assigneeIds");
  });

  it("refuses an unknown section before creating anything", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockResolvedValueOnce(occurrenceRow([]) as never);
    await expect(
      addAgendaItem(db, "occ-1", { kind: "action", sectionKey: "nope", title: "x", userId: "u-1", actor }, now),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(createAction).not.toHaveBeenCalled();
  });

  it("names the Action it created when the agenda write then fails", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique
      .mockResolvedValueOnce(occurrenceRow([]) as never)
      .mockResolvedValueOnce({ agenda: null } as never);
    createAction.mockResolvedValue({ id: "act-11" });
    await expect(
      addAgendaItem(db, "occ-1", { kind: "action", sectionKey: "blk", title: "Ship it", userId: "u-1", actor }, now),
    ).rejects.toThrow(/act-11/);
  });
});

describe("resolveAgendaItem", () => {
  const actor = { userId: "u-1", isAdmin: false };
  const withItems = () => ({
    agenda: {
      version: 1,
      generatedAt: "x",
      sections: [
        { key: "s", type: "free_text", title: "S", items: [
          { id: "s:hand:1", sectionKey: "s", title: "Respond", refType: "action", refId: "act-1", order: 0, addedByUserId: "u-1" },
          { id: "s:hand:2", sectionKey: "s", title: "Note", refType: "text", refId: "s:hand:2", order: 1, addedByUserId: "u-1" },
        ] },
      ],
    },
  });

  beforeEach(() => applyActionUpdate.mockReset());

  it("ticking an action item completes the Action, then stamps the item", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockImplementation((() => Promise.resolve(withItems())) as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    const res = await resolveAgendaItem(db, "occ-1", "s:hand:1", true, actor, now);
    expect(applyActionUpdate).toHaveBeenCalledWith({ db, actor }, "act-1", { status: "COMPLETED" });
    expect(res.sections[0]!.items[0]!.resolvedAt).toBe(now.toISOString());
  });

  it("unticking reactivates the Action", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockImplementation((() => Promise.resolve(withItems())) as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    await resolveAgendaItem(db, "occ-1", "s:hand:1", false, actor, now);
    expect(applyActionUpdate).toHaveBeenCalledWith({ db, actor }, "act-1", { status: "ACTIVE" });
  });

  it("a note only flips resolvedAt; a refused Action update leaves the item alone", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockImplementation((() => Promise.resolve(withItems())) as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    await resolveAgendaItem(db, "occ-1", "s:hand:2", true, actor, now);
    expect(applyActionUpdate).not.toHaveBeenCalled();

    applyActionUpdate.mockRejectedValueOnce(Object.assign(new Error("no"), { code: "FORBIDDEN" }));
    db.ceremonyOccurrence.update.mockClear();
    await expect(resolveAgendaItem(db, "occ-1", "s:hand:1", true, actor, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });
});

describe("addAgendaItem kind decision", () => {
  beforeEach(() => createAction.mockReset());
  const occ = { workspaceId: "ws-1", ceremony: { workspace: { slug: "clear" } } };

  it("links an existing Decision by number, defaulting the title to its statement, and creates none", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique
      .mockResolvedValueOnce(occ as never)
      .mockResolvedValueOnce({ agenda: JSON.parse(JSON.stringify(agenda)) } as never);
    db.ceremonyOccurrence.update.mockResolvedValue({} as never);
    db.decision.findFirst.mockResolvedValue({ id: "d-150", statement: "Ship CSV export?" } as never);

    const res = await addAgendaItem(db, "occ-1", { kind: "decision", sectionKey: "blk", title: "", userId: "u-1", decisionNumber: 150 }, now);

    // Scoped to what the adder may read: a restricted Decision reads as not found.
    expect(db.decision.findFirst.mock.calls[0]![0]!.where).toMatchObject({ number: 150, AND: [expect.objectContaining({ workspaceId: "ws-1", reviewState: "CONFIRMED" })] });
    expect(res.sections[0]!.items[2]).toMatchObject({
      refType: "decision",
      refId: "d-150",
      title: "Ship CSV export?",
      href: "/w/clear/decisions/d/d-150",
      addedByUserId: "u-1",
    });
    expect(db.decision.create).not.toHaveBeenCalled();
    expect(createAction).not.toHaveBeenCalled();
  });

  it("refuses an unknown decision, and a call naming none", async () => {
    const db = withTx(mockDeep<PrismaClient>());
    db.ceremonyOccurrence.findUnique.mockResolvedValue(occ as never);
    db.decision.findFirst.mockResolvedValue(null);
    await expect(
      addAgendaItem(db, "occ-1", { kind: "decision", sectionKey: "blk", title: "", userId: "u-1", decisionId: "nope" }, now),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      addAgendaItem(db, "occ-1", { kind: "decision", sectionKey: "blk", title: "", userId: "u-1" }, now),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.ceremonyOccurrence.update).not.toHaveBeenCalled();
  });
});
