import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { draftMyUpdate, saveMyUpdate, type OccurrenceUpdateScope } from "../occurrenceUpdates";

const buildDraftAnswers = vi.hoisted(() => vi.fn());
vi.mock("../draftAnswers", () => ({ buildDraftAnswers }));

const scope = (overrides: Partial<OccurrenceUpdateScope> = {}): OccurrenceUpdateScope => ({
  occurrenceId: "occ-1",
  workspaceId: "ws-1",
  ceremonyId: "cer-1",
  kind: "STANDUP",
  projectId: null,
  scheduledStart: new Date("2026-09-12T08:00:00Z"),
  previousStart: new Date("2026-09-11T08:00:00Z"),
  participantUserIds: ["u-1"],
  ...overrides,
});

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "upd-1",
  occurrenceId: "occ-1",
  userId: "u-1",
  draftAnswers: {},
  answers: { done: "typed" },
  draftedAt: null,
  submittedAt: null,
  flaggedBlocker: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

function db() {
  const mock = mockDeep<PrismaClient>();
  mock.ceremonyOccurrenceUpdate.upsert.mockImplementation((async (args: { create: Record<string, unknown>; update: Record<string, unknown> }) =>
    row({ ...args.create, ...args.update })) as never);
  return mock;
}

describe("draftMyUpdate", () => {
  it("seeds the answers from the first draft, and later only refreshes the suggestion", async () => {
    const mock = db();
    buildDraftAnswers.mockResolvedValue({ answers: { done: "- shipped it", today: "", blockers: "" }, hasContent: true });

    mock.ceremonyOccurrenceUpdate.findUnique.mockResolvedValueOnce(null as never);
    await draftMyUpdate(mock, scope(), "u-1");
    const first = mock.ceremonyOccurrenceUpdate.upsert.mock.calls[0]![0]!;
    expect(first.create).toMatchObject({ answers: { done: "- shipped it" }, draftAnswers: { done: "- shipped it" } });

    mock.ceremonyOccurrenceUpdate.findUnique.mockResolvedValueOnce(row() as never);
    await draftMyUpdate(mock, scope(), "u-1");
    const second = mock.ceremonyOccurrenceUpdate.upsert.mock.calls[1]![0]!;
    // The answers are theirs now: only the suggestion moves.
    expect(second.update).not.toHaveProperty("answers");
    expect(second.update).toMatchObject({ draftAnswers: { done: "- shipped it" } });
  });

  it("refuses to re-draft a submitted update until it is reopened", async () => {
    const mock = db();
    buildDraftAnswers.mockResolvedValue({ answers: { done: "- shipped it" }, hasContent: true });
    mock.ceremonyOccurrenceUpdate.findUnique.mockResolvedValue(row({ submittedAt: new Date() }) as never);
    await expect(draftMyUpdate(mock, scope(), "u-1")).rejects.toThrow(/Reopen your update/);
    expect(mock.ceremonyOccurrenceUpdate.upsert).not.toHaveBeenCalled();
  });

  it("refuses non-participants and kinds with no async format", async () => {
    const mock = db();
    await expect(draftMyUpdate(mock, scope(), "u-9")).rejects.toThrow(/not a participant/);
    await expect(draftMyUpdate(mock, scope({ kind: "RETROSPECTIVE" }), "u-1")).rejects.toThrow(/no async update format/);
  });
});

describe("saveMyUpdate", () => {
  it("leaves submittedAt alone when the client only saves", async () => {
    const mock = db();
    await saveMyUpdate(mock, scope(), "u-1", { answers: { done: "typed" } });
    const args = mock.ceremonyOccurrenceUpdate.upsert.mock.calls[0]![0]!;
    expect(args.update).toEqual({ answers: { done: "typed" } });
    expect(args.create).toMatchObject({ submittedAt: null });
  });

  it("submits with submit: true and reopens with submit: false — the path the panel's Edit button takes", async () => {
    const mock = db();
    const submitted = await saveMyUpdate(mock, scope(), "u-1", { answers: { done: "typed" }, submit: true });
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(mock.ceremonyOccurrenceUpdate.upsert.mock.calls[0]![0]!.update).toMatchObject({ submittedAt: expect.any(Date) });

    const reopened = await saveMyUpdate(mock, scope(), "u-1", { answers: { done: "typed" }, submit: false });
    expect(reopened.submittedAt).toBeNull();
    expect(mock.ceremonyOccurrenceUpdate.upsert.mock.calls[1]![0]!.update).toMatchObject({ submittedAt: null });
  });

  it("drops answers whose key is not a question for the kind before writing", async () => {
    const mock = db();
    await saveMyUpdate(mock, scope(), "u-1", { answers: { done: "typed", weather: "sunny" } });
    expect(mock.ceremonyOccurrenceUpdate.upsert.mock.calls[0]![0]!.update).toEqual({ answers: { done: "typed" } });
  });
});
