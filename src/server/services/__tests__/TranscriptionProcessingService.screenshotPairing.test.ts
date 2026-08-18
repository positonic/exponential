/**
 * Regression guard for screenshot→action pairing when a create fails mid-list.
 *
 * `InternalActionProcessor.processActionItems` skips failed creates, so its
 * `createdItems` array is NOT index-parallel with the input action items. The
 * screenshot junction loop in `generateDraftActions` used to pair
 * `createdItems[i]` with `actionItems[i]`, so one failed create shifted every
 * subsequent pairing and attached screenshots to the wrong actions. The fix is
 * the index-parallel `itemResults` array (null placeholder on failure).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

vi.mock("../FirefliesService", () => ({
  FirefliesService: { parseActionItems: vi.fn(() => []) },
}));

vi.mock("../ActionExtractionService", () => ({
  ActionExtractionService: {
    extractFromNotes: vi.fn(),
    extractFromTranscript: vi.fn(),
  },
  numberScreenshotMarkers: vi.fn((text: string) => ({ numberedText: text, count: 0 })),
  filterNearDuplicateActions: vi.fn((items: unknown[]) => items),
  mergeActionItems: vi.fn((a: unknown[], b: unknown[]) => [...a, ...b]),
}));

vi.mock("../notifications/NotificationServiceFactory", () => ({
  NotificationServiceFactory: {},
}));
vi.mock("../SlackChannelResolver", () => ({ SlackChannelResolver: {} }));
vi.mock("../notifications/SlackNotificationService", () => ({
  SlackNotificationService: {},
}));
vi.mock("../access", () => ({
  getProjectAccess: vi.fn(),
  hasProjectAccess: vi.fn(),
}));
vi.mock("../meetings/assignMeetingPlacement", () => ({
  assignMeetingPlacement: vi.fn(),
}));

import { TranscriptionProcessingService } from "../TranscriptionProcessingService";
import { InternalActionProcessor } from "../processors/InternalActionProcessor";
import { ActionExtractionService } from "../ActionExtractionService";

const USER_ID = "user-1";
const TRANSCRIPTION_ID = "session-1";

/** db.action.create mock that fails for one specific action name. */
function mockActionCreateFailingOn(db: DeepMockProxy<PrismaClient>, failName: string) {
  db.action.create.mockImplementation(((args: { data: { name: string } }) => {
    if (args.data.name === failName) {
      return Promise.reject(new Error("simulated create failure"));
    }
    return Promise.resolve({ id: `id-${args.data.name}`, name: args.data.name });
  }) as never);
}

describe("screenshot pairing survives a failed create mid-list", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = getDbMock();
    mockReset(db);
  });

  it("InternalActionProcessor.itemResults stays index-parallel with its input", async () => {
    mockActionCreateFailingOn(db, "Second action");

    const processor = new InternalActionProcessor({
      userId: USER_ID,
      transcriptionId: TRANSCRIPTION_ID,
      actionStatus: "DRAFT",
    });

    const result = await processor.processActionItems([
      { text: "First action" },
      { text: "Second action" },
      { text: "Third action" },
    ]);

    expect(result.processedCount).toBe(2);
    expect(result.createdItems).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.itemResults).toEqual([
      { id: "id-First action", title: "First action" },
      null,
      { id: "id-Third action", title: "Third action" },
    ]);
  });

  it("generateDraftActions attaches screenshotRefs to the correct actions", async () => {
    db.transcriptionSession.findUnique.mockResolvedValue({
      id: TRANSCRIPTION_ID,
      userId: USER_ID,
      projectId: null,
      project: null,
      user: { id: USER_ID },
      title: "Test meeting",
      summary: null,
      notes: "- a curated notes action",
      transcription: "some transcript text with [SCREENSHOT] markers",
    } as never);
    db.screenshot.findMany.mockResolvedValue([
      { id: "shot-1" },
      { id: "shot-2" },
      { id: "shot-3" },
    ] as never);
    db.action.count.mockResolvedValue(0);
    db.actionScreenshot.createMany.mockResolvedValue({ count: 2 } as never);
    db.transcriptionSession.update.mockResolvedValue({} as never);

    // Mirrors the post-PR-600 shape: a notes-derived item (no screenshotRefs)
    // sits ahead of the transcript items (with refs) in the merged array.
    vi.mocked(ActionExtractionService.extractFromNotes).mockResolvedValue([
      { text: "Notes action" },
    ]);
    vi.mocked(ActionExtractionService.extractFromTranscript).mockResolvedValue([
      { text: "First action", screenshotRefs: [1] },
      { text: "Second action", screenshotRefs: [2] },
      { text: "Third action", screenshotRefs: [3] },
    ]);

    // A mid-list create fails — before the fix this shifted "Third action"
    // onto the second transcript item's refs, attaching shot-2 to the wrong
    // action.
    mockActionCreateFailingOn(db, "Second action");

    await TranscriptionProcessingService.generateDraftActions(
      TRANSCRIPTION_ID,
      USER_ID,
    );

    expect(db.actionScreenshot.createMany).toHaveBeenCalledTimes(1);
    expect(db.actionScreenshot.createMany).toHaveBeenCalledWith({
      data: [
        { actionId: "id-First action", screenshotId: "shot-1" },
        { actionId: "id-Third action", screenshotId: "shot-3" },
      ],
      skipDuplicates: true,
    });
  });
});
