/**
 * `generateDraftDecisions` (ADR-0060 decision 4): access, the idempotent
 * short-circuits, notes-first then transcript, evidence-or-discard, and the
 * draft rows it writes. Prisma is mocked; the extractor is stubbed with
 * canned candidates — no model calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { extractFromTranscript, extractFromNotes, recordActivityMock, emitNotificationMock, accessMock } = vi.hoisted(() => ({
  extractFromTranscript: vi.fn(),
  extractFromNotes: vi.fn(),
  recordActivityMock: vi.fn(async () => true),
  emitNotificationMock: vi.fn(async () => undefined),
  accessMock: { canEdit: true },
}));
// Imports the Prisma singleton at module load, which the unit environment's
// client-side env guard rejects.
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer: vi.fn() }));
vi.mock("~/server/services/notifications/emit/emitNotification", () => ({ emitNotification: emitNotificationMock }));

vi.mock("~/server/services/DecisionExtractionService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/server/services/DecisionExtractionService")>();
  return {
    ...actual,
    DecisionExtractionService: { extractFromTranscript, extractFromNotes },
  };
});
vi.mock("~/server/services/activity/recordActivity", () => ({ recordActivity: recordActivityMock }));
vi.mock("~/server/services/access", () => ({
  getTranscriptionAccess: vi.fn(async () => ({})),
  canEditTranscription: () => accessMock.canEdit,
  // The dedupe/open-decision corpus is read through the resolver's clause so
  // it can never include decisions the acting user may not see.
  buildDecisionAccessWhere: (userId: string, workspaceId: string) => ({ workspaceId, __accessFor: userId }),
}));

import {
  generateDraftDecisions,
  resolveDeciders,
  candidateBody,
  summaryDecisionText,
} from "../generateDraftDecisions";
import type { DecisionCandidate } from "~/server/services/DecisionExtractionService";

const TRANSCRIPT = [
  "Dev Fixture: Morning. Blockers first - anything stuck?",
  "Pat Reviewer: The accordion PR is waiting on a review, otherwise clear.",
  "Dev Fixture: Can we talk about whether the peek drawer should ship before the hover affordances?",
  "Pat Reviewer: That is a prioritisation call, not a standup one. Let's park it for the prioritisation ceremony.",
  "Dev Fixture: Agreed. Decision: prioritisation debates get parked and go to the prioritisation ceremony.",
].join("\n");

const PARTICIPANTS = [
  { userId: "u-dev", name: "Dev Fixture", email: "dev@example.test", speakerLabel: null },
  { userId: null, name: "Pat Reviewer", email: "pat@example.test", speakerLabel: null },
];

const MEETING = {
  id: "m1",
  title: "Daily Standup",
  userId: "u-dev",
  projectId: "p1",
  workspaceId: "w1",
  occurrenceId: "occ1",
  meetingDate: new Date("2026-09-08T09:00:00Z"),
  transcription: TRANSCRIPT,
  sentencesJson: null,
  notes: null as string | null,
  summary: null as string | null,
  participants: PARTICIPANTS,
};

function candidate(overrides: Partial<DecisionCandidate> = {}): DecisionCandidate {
  return {
    statement: "Prioritisation debates are parked for the prioritisation ceremony",
    rationale: "Standups are not for prioritisation.",
    deciderNames: ["Pat", "Dev Fixture"],
    evidence: [{ turnIndex: 4, speaker: "Dev Fixture", startTime: null, text: "Agreed." }],
    origin: "transcript",
    ...overrides,
  };
}

/** `extractFromTranscript` returns a run object, not a bare array. */
function transcriptRun(candidates: unknown[], over: Record<string, number> = {}) {
  return { candidates, chunksTotal: 1, chunksFailed: 0, chunksSkipped: 0, ...over };
}

describe("generateDraftDecisions", () => {
  let db: DeepMockProxy<PrismaClient>;
  let counter: number;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    extractFromTranscript.mockReset();
    extractFromNotes.mockReset();
    recordActivityMock.mockClear();
    emitNotificationMock.mockClear();
    accessMock.canEdit = true;
    counter = 0;

    db.transcriptionSession.findUnique.mockResolvedValue(MEETING as never);
    db.decision.findMany.mockResolvedValue([] as never);
    // Hand the callback a client WITHOUT `$transaction`, the way Prisma does:
    // `Prisma.TransactionClient` omits it because interactive transactions do
    // not nest. A plain `mockDeep` tx answers `$transaction` happily, which
    // lets a nested-transaction bug type-check and pass while failing against
    // a real database — this proxy makes that mistake fail here instead.
    const txClient = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "$transaction") {
          throw new Error("tx.$transaction is not a function — interactive transactions do not nest");
        }
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    db.$transaction.mockImplementation(async (fn: unknown) =>
      (fn as (tx: PrismaClient) => Promise<unknown>)(txClient as unknown as PrismaClient),
    );
    db.workspace.update.mockImplementation((() => {
      counter++;
      return Promise.resolve({ decisionCounter: counter });
    }) as never);
    db.decision.create.mockImplementation(((args: { data: { number: number; statement: string; supersededById: string | null } }) =>
      Promise.resolve({
        id: `d-${args.data.number}`,
        number: args.data.number,
        statement: args.data.statement,
        supersededById: args.data.supersededById,
      })) as never);
  });

  it("refuses without edit access to the meeting", async () => {
    accessMock.canEdit = false;
    const result = await generateDraftDecisions(db, "m1", "stranger");
    expect(result.success).toBe(false);
    expect(result.errors[0]).toMatch(/edit access/);
    expect(extractFromTranscript).not.toHaveBeenCalled();
  });

  it("writes DRAFT rows with source MEETING, evidence, resolved deciders and the meeting's date", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([candidate()]));

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    expect(result).toMatchObject({ success: true, draftsCreated: 1, draftCount: 1, alreadyDrafted: false, alreadyPublished: false });
    expect(db.decision.create).toHaveBeenCalledTimes(1);
    const data = db.decision.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      workspaceId: "w1",
      number: 1,
      reviewState: "DRAFT",
      source: "MEETING",
      status: "ACCEPTED",
      transcriptionSessionId: "m1",
      occurrenceId: "occ1",
      projectId: "p1",
      decidedAt: MEETING.meetingDate,
      createdById: "u-dev",
      supersededById: null,
      body: "## Context\nStandups are not for prioritisation.",
    });
    expect(data.evidence).toEqual([{ turnIndex: 4, speaker: "Dev Fixture", startTime: null, text: "Agreed." }]);
    expect(data.deciders).toEqual({
      create: [
        { userId: null, name: "Pat Reviewer", email: "pat@example.test" },
        { userId: "u-dev", name: "Dev Fixture", email: "dev@example.test" },
      ],
    });
    // Never confirmed by extraction.
    expect(data).not.toHaveProperty("confirmedById");
    expect(recordActivityMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ entityType: "meeting", entityId: "m1", action: "updated", workspaceId: "w1" }),
    );
    // Manual trigger: the requester is the actor, so they are not told about their own drafts.
    expect(emitNotificationMock).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "meeting_ready",
        actorUserId: "u-dev",
        subject: { sessionId: "m1", draftDecisionCount: 1 },
      }),
    );
  });

  it("post-summary trigger: notifies the owner (no actor) and never notifies when nothing was drafted", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([candidate()]));
    await generateDraftDecisions(db, "m1", "u-dev", { trigger: "post_summary" });
    expect(emitNotificationMock).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: null }));

    emitNotificationMock.mockClear();
    extractFromTranscript.mockResolvedValue(transcriptRun([]));
    db.decision.findMany.mockResolvedValue([] as never);
    await generateDraftDecisions(db, "m1", "u-dev", { trigger: "post_summary" });
    expect(emitNotificationMock).not.toHaveBeenCalled();
  });

  it("passes the transcript turns and the workspace's confirmed statements and open decisions to the extractor", async () => {
    db.decision.findMany
      .mockResolvedValueOnce([] as never) // the meeting's own rows
      .mockResolvedValueOnce([
        { id: "d-open", number: 7, statement: "Should the peek drawer ship first?", status: "OPEN" },
        { id: "d-acc", number: 5, statement: "Standups stay inside fifteen minutes", status: "ACCEPTED" },
      ] as never);
    extractFromTranscript.mockResolvedValue(transcriptRun([]));

    await generateDraftDecisions(db, "m1", "u-dev");

    expect(extractFromTranscript).toHaveBeenCalledTimes(1);
    const [turns, options] = extractFromTranscript.mock.calls[0]!;
    expect(turns).toHaveLength(5);
    expect(turns[4]).toMatchObject({ speaker: "Dev Fixture" });
    expect(options.existingStatements).toEqual([
      "Should the peek drawer ship first?",
      "Standups stay inside fifteen minutes",
    ]);
    expect(options.openDecisions).toEqual([
      { id: "d-open", label: "D-0007", statement: "Should the peek drawer ship first?", status: "OPEN" },
    ]);
  });

  it("returns existing drafts without calling the model (idempotent)", async () => {
    db.decision.findMany.mockResolvedValueOnce([
      { id: "d1", reviewState: "DRAFT" },
      { id: "d2", reviewState: "DRAFT" },
    ] as never);

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    expect(result).toMatchObject({ success: true, alreadyDrafted: true, draftCount: 2, draftsCreated: 0 });
    expect(extractFromTranscript).not.toHaveBeenCalled();
    expect(db.decision.create).not.toHaveBeenCalled();
  });

  it("reports alreadyPublished once the meeting has confirmed decisions", async () => {
    db.decision.findMany.mockResolvedValueOnce([{ id: "d1", reviewState: "CONFIRMED" }] as never);

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    expect(result).toMatchObject({ success: true, alreadyPublished: true, draftCount: 0 });
    expect(extractFromTranscript).not.toHaveBeenCalled();
  });

  it("extracts from notes first, backs each notes candidate with a transcript turn, and discards the unsupported", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({
      ...MEETING,
      notes: "## Decisions\n- Park prioritisation debates for the prioritisation ceremony\n- Migrate billing to Kubernetes",
    } as never);
    extractFromNotes.mockResolvedValue([
      candidate({ statement: "Park prioritisation debates for the prioritisation ceremony", evidence: [], origin: "notes", rationale: undefined }),
      candidate({ statement: "Migrate billing to Kubernetes", evidence: [], origin: "notes", rationale: undefined }),
    ]);
    extractFromTranscript.mockResolvedValue(transcriptRun([
      // A rewording of the notes decision — dropped by the near-duplicate filter.
      candidate({ statement: "Prioritisation debates get parked for the prioritisation ceremony" }),
      candidate({ statement: "Pat reviews the accordion PR today", evidence: [{ turnIndex: 1, speaker: "Pat Reviewer", startTime: null, text: "…" }] }),
    ]));

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    expect(extractFromNotes).toHaveBeenCalledTimes(1);
    // The transcript pass is told what notes already yielded.
    expect(extractFromTranscript.mock.calls[0]![1].existingStatements).toContain(
      "Park prioritisation debates for the prioritisation ceremony",
    );
    expect(result.discardedWithoutEvidence).toBe(1);
    const statements = db.decision.create.mock.calls.map((c) => c[0].data.statement);
    expect(statements).toEqual([
      "Park prioritisation debates for the prioritisation ceremony",
      "Pat reviews the accordion PR today",
    ]);
    // The notes draft carries deterministic evidence from the transcript.
    const notesEvidence = db.decision.create.mock.calls[0]![0].data.evidence as { turnIndex: number }[];
    expect(notesEvidence.length).toBeGreaterThan(0);
  });

  it("excludes statements rejected from this meeting so a re-run does not propose them again", async () => {
    db.decision.findMany
      .mockResolvedValueOnce([{ id: "d-rej", reviewState: "REJECTED", statement: "Pat reviews the accordion PR today" }] as never)
      .mockResolvedValueOnce([] as never);
    extractFromTranscript.mockResolvedValue(transcriptRun([
      candidate({ statement: "Pat reviews the accordion PR today", evidence: [{ turnIndex: 1, speaker: "Pat Reviewer", startTime: null, text: "…" }] }),
      candidate({ statement: "Blockers come first in every standup", evidence: [{ turnIndex: 0, speaker: "Dev Fixture", startTime: null, text: "…" }] }),
    ]));

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    expect(result.alreadyPublished).toBe(false);
    expect(extractFromTranscript.mock.calls[0]![1].existingStatements).toContain("Pat reviews the accordion PR today");
    expect(db.decision.create.mock.calls.map((c) => c[0].data.statement)).toEqual(["Blockers come first in every standup"]);
  });

  it("reads Decision:/Key Decisions callouts from the stored summary without a model call", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({
      ...MEETING,
      summary: JSON.stringify({
        overview: "Short standup.",
        detailed_breakdown: "## Key Decisions\n- **Decision:** Prioritisation debates get parked for the prioritisation ceremony\n- Decision: Migrate billing to Kubernetes",
        keywords: [],
      }),
    } as never);
    extractFromTranscript.mockResolvedValue(transcriptRun([]));

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    expect(extractFromNotes).not.toHaveBeenCalled();
    // The Kubernetes callout has no supporting turn; the parked-debates one does.
    expect(result.discardedWithoutEvidence).toBe(1);
    expect(db.decision.create.mock.calls.map((c) => c[0].data.statement)).toEqual([
      "Prioritisation debates get parked for the prioritisation ceremony",
    ]);
    expect(extractFromTranscript.mock.calls[0]![1].existingStatements).toContain(
      "Prioritisation debates get parked for the prioritisation ceremony",
    );
  });

  it("stores a resolution draft pointing at the open decision it resolves", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([candidate({ resolvesDecisionId: "d-open" })]));

    await generateDraftDecisions(db, "m1", "u-dev");

    expect(db.decision.create.mock.calls[0]![0].data).toMatchObject({
      reviewState: "DRAFT",
      supersededById: "d-open",
    });
  });

  it("scopes the dedupe and open-decision corpus through the access resolver", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([]));
    await generateDraftDecisions(db, "m1", "u-dev");
    // Both corpus reads carry the resolver's clause: an unscoped read would
    // ship decisions the caller cannot see to the model, and surface a
    // restricted statement in the review card via `resolvesDecisionId`.
    const corpusCalls = db.decision.findMany.mock.calls.filter(
      (c) => Array.isArray((c[0]?.where as { AND?: unknown[] } | undefined)?.AND),
    );
    expect(corpusCalls.length).toBeGreaterThanOrEqual(2);
    for (const call of corpusCalls) {
      const and = (call[0]!.where as { AND: Array<Record<string, unknown>> }).AND;
      expect(and[0]).toMatchObject({ __accessFor: "u-dev" });
    }
    // Open questions are read unbounded; only the confirmed set is capped,
    // so an old open question can never fall out of the resolvable set.
    const unbounded = corpusCalls.filter((c) => c[0]!.take === undefined);
    expect(unbounded).toHaveLength(1);
  });

  it("keeps notes candidates without transcript evidence when the meeting has no transcript", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({
      ...MEETING,
      transcription: null,
      sentencesJson: null,
      notes: "## Decisions\n- Prioritisation debates are parked for the prioritisation ceremony",
    } as never);
    extractFromNotes.mockResolvedValue([candidate({ origin: "notes", evidence: [] })]);

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    // `findSupportingTurns` over zero turns can only return nothing, so
    // requiring evidence here discarded every candidate after paying for the
    // model call. A curated notes list is the evidence when there is no
    // transcript to cite.
    expect(result).toMatchObject({ success: true, draftsCreated: 1, discardedWithoutEvidence: 0 });
    expect(extractFromTranscript).not.toHaveBeenCalled();
  });

  it("gives the transcript pass only the budget the notes pass left", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({
      ...MEETING,
      notes: "## Decisions\n- Park prioritisation debates for the prioritisation ceremony",
    } as never);
    extractFromNotes.mockResolvedValue([
      candidate({ statement: "Park prioritisation debates for the prioritisation ceremony", evidence: [], origin: "notes", rationale: undefined }),
    ]);
    extractFromTranscript.mockResolvedValue(transcriptRun([]));

    await generateDraftDecisions(db, "m1", "u-dev");

    // One shared budget across both passes. They used to cap at 15 each, so
    // one meeting could mint 30 drafts and burn 30 labels from the workspace
    // sequence whatever the reviewer then decided.
    const options = extractFromTranscript.mock.calls[0]![1] as { maxDecisions: number };
    expect(options.maxDecisions).toBe(14);
  });

  it("opens the transaction before writing any draft, so a killed run leaves none behind", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([candidate(), candidate({ statement: "Second thing" })]));
    await generateDraftDecisions(db, "m1", "u-dev");

    // The short-circuit treats any existing draft as "this meeting is done",
    // so a partial set would make every retry report a truncated run as
    // complete. The outer transaction must therefore open first.
    expect(db.decision.create).toHaveBeenCalledTimes(2);
    const firstTransaction = db.$transaction.mock.invocationCallOrder[0]!;
    const firstCreate = db.decision.create.mock.invocationCallOrder[0]!;
    expect(firstTransaction).toBeLessThan(firstCreate);
  });

  it("reports a wholly-failed transcript pass instead of calling it an empty meeting", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([], { chunksFailed: 3, chunksTotal: 3 }));
    const result = await generateDraftDecisions(db, "m1", "u-dev");
    expect(result.errors.join(" ")).toMatch(/failed to extract/i);
  });

  it("warns about partial transcript coverage without failing the run", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([candidate()], { chunksTotal: 9, chunksSkipped: 3 }));
    const result = await generateDraftDecisions(db, "m1", "u-dev");
    // A run that read six of nine sections and produced drafts succeeded with
    // a caveat. Carrying that in `errors` made the router throw it away as a
    // failure alongside whatever really went wrong.
    expect(result.success).toBe(true);
    expect(result.draftCount).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(" ")).toMatch(/3 of its 9 sections were not read/);
  });

  it("reserves the whole block of labels in one statement, not one per draft", async () => {
    extractFromTranscript.mockResolvedValue(
      transcriptRun([candidate({ statement: "One" }), candidate({ statement: "Two" }), candidate({ statement: "Three" })]),
    );
    db.workspace.update.mockResolvedValue({ decisionCounter: 12 } as never);

    const result = await generateDraftDecisions(db, "m1", "u-dev");

    expect(result.draftsCreated).toBe(3);
    // One increment of 3 — not three increments of 1, which is what spent the
    // transaction budget on round trips against a production database.
    expect(db.workspace.update).toHaveBeenCalledTimes(1);
    expect(db.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { decisionCounter: { increment: 3 } } }),
    );
    // The reserved block is handed out in order: 10, 11, 12.
    const numbers = db.decision.create.mock.calls.map(
      (c) => (c[0] as { data: { number: number } }).data.number,
    );
    expect(numbers).toEqual([10, 11, 12]);
  });

  it("gives the all-or-nothing write a budget bigger than Prisma's local-database default", async () => {
    extractFromTranscript.mockResolvedValue(transcriptRun([candidate()]));
    await generateDraftDecisions(db, "m1", "u-dev");
    const options = db.$transaction.mock.calls[0]![1] as { timeout: number; maxWait: number } | undefined;
    expect(options?.timeout).toBeGreaterThan(5_000);
    expect(options?.maxWait).toBeGreaterThan(2_000);
  });

  it("is a no-op success for a meeting with neither transcript nor notes", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({ ...MEETING, transcription: null } as never);
    const result = await generateDraftDecisions(db, "m1", "u-dev");
    expect(result).toMatchObject({ success: true, draftCount: 0 });
    expect(extractFromTranscript).not.toHaveBeenCalled();
  });
});

describe("resolveDeciders", () => {
  it("matches full names and first names to participants, keeps unknown names as external", () => {
    expect(resolveDeciders(["pat", "Dev Fixture", "Sam"], PARTICIPANTS)).toEqual([
      { userId: null, name: "Pat Reviewer", email: "pat@example.test" },
      { userId: "u-dev", name: "Dev Fixture", email: "dev@example.test" },
      { name: "Sam" },
    ]);
  });

  it("falls back to every participant when the model named nobody", () => {
    expect(resolveDeciders([], PARTICIPANTS)).toHaveLength(2);
  });
});

describe("candidateBody", () => {
  it("renders rationale and alternatives under ADR headings, or null", () => {
    expect(candidateBody(candidate({ rationale: "why", alternatives: "what else" }))).toBe(
      "## Context\nwhy\n\n## Alternatives considered\nwhat else",
    );
    expect(candidateBody(candidate({ rationale: undefined }))).toBeNull();
  });
});


describe("summaryDecisionText", () => {
  it("joins a Fireflies-shaped summary's breakdown, bullets and overview; passes plain text through", () => {
    const text = summaryDecisionText(
      JSON.stringify({ overview: "Over.", shorthand_bullet: ["Agreed: weekly demos", "- kept"], detailed_breakdown: "## Theme\n- x", keywords: [] }),
    );
    expect(text).toBe("## Theme\n- x\n\n- Agreed: weekly demos\n- kept\n\nOver.");
    expect(summaryDecisionText("Plain summary. Decision: ship it")).toBe("Plain summary. Decision: ship it");
    expect(summaryDecisionText(null)).toBe("");
  });
});
