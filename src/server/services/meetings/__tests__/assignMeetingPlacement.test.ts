/**
 * Unit tests for the `assignMeetingPlacement` deep module.
 *
 * Uses `mockDeep<PrismaClient>()` so tests run in milliseconds and never touch
 * a real DB (per CLAUDE.md "Test database safety"). The access resolvers are
 * mocked so each test controls access outcomes directly and asserts the
 * service's own logic: project-authoritative workspace resolution, Action
 * re-homing, the null-clear case, edit-access enforcement, and bulk scoping.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

import { assignMeetingPlacement } from "../assignMeetingPlacement";
import {
  getProjectAccess,
  canEditProject,
  getTranscriptionAccess,
  canEditTranscription,
} from "~/server/services/access";

vi.mock("~/server/services/access", () => ({
  getProjectAccess: vi.fn(),
  canEditProject: vi.fn(),
  getTranscriptionAccess: vi.fn(),
  canEditTranscription: vi.fn(),
}));

const db = mockDeep<PrismaClient>();
const USER = "user-1";

/** Make $transaction run the array of (mocked) Prisma promises, as in prod. */
function runTransactionsLikeProd(mock: DeepMockProxy<PrismaClient>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mock.$transaction as any).mockImplementation((ops: unknown) =>
    Promise.all(ops as Promise<unknown>[]),
  );
}

beforeEach(() => {
  mockReset(db);
  vi.mocked(getProjectAccess).mockReset();
  vi.mocked(canEditProject).mockReset();
  vi.mocked(getTranscriptionAccess).mockReset();
  vi.mocked(canEditTranscription).mockReset();
  runTransactionsLikeProd(db);
  // Default: updateMany reports one row touched.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db.transcriptionSession.updateMany as any).mockResolvedValue({ count: 1 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (db.action.updateMany as any).mockResolvedValue({ count: 0 });
});

describe("assignMeetingPlacement", () => {
  it("derives the meeting's workspace from the target project (project-authoritative)", async () => {
    vi.mocked(canEditProject).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.project.findUnique as any).mockResolvedValue({ workspaceId: "ws-A" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.transcriptionSession.findMany as any).mockResolvedValue([{ id: "m1" }]);

    const result = await assignMeetingPlacement(db, USER, {
      meetingIds: ["m1"],
      projectId: "proj-1",
      scope: "owner",
    });

    expect(result.workspaceId).toBe("ws-A");
    expect(db.transcriptionSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ projectId: "proj-1", workspaceId: "ws-A" }),
      }),
    );
  });

  it("re-homes child Actions' projectId AND workspaceId to match the meeting", async () => {
    vi.mocked(canEditProject).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.project.findUnique as any).mockResolvedValue({ workspaceId: "ws-A" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.transcriptionSession.findMany as any).mockResolvedValue([{ id: "m1" }]);

    await assignMeetingPlacement(db, USER, {
      meetingIds: ["m1"],
      projectId: "proj-1",
      scope: "owner",
    });

    expect(db.action.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transcriptionSessionId: { in: ["m1"] },
        }),
        data: { projectId: "proj-1", workspaceId: "ws-A" },
      }),
    );
  });

  it("clears project AND workspace on the meeting and its Actions when projectId is null", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.transcriptionSession.findMany as any).mockResolvedValue([{ id: "m1" }]);

    const result = await assignMeetingPlacement(db, USER, {
      meetingIds: ["m1"],
      projectId: null,
      scope: "owner",
    });

    expect(result.workspaceId).toBeNull();
    // No project access check is performed for a null target.
    expect(getProjectAccess).not.toHaveBeenCalled();
    expect(db.action.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { projectId: null, workspaceId: null },
      }),
    );
  });

  it("throws FORBIDDEN when the caller cannot edit the target project", async () => {
    vi.mocked(canEditProject).mockReturnValue(false);

    await expect(
      assignMeetingPlacement(db, USER, {
        meetingIds: ["m1"],
        projectId: "proj-1",
        scope: "editable",
      }),
    ).rejects.toThrow(TRPCError);
    expect(db.transcriptionSession.updateMany).not.toHaveBeenCalled();
  });

  it("throws FORBIDDEN (editable scope) when the caller cannot edit a requested meeting", async () => {
    vi.mocked(canEditProject).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.project.findUnique as any).mockResolvedValue({ workspaceId: "ws-A" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.transcriptionSession.findMany as any).mockResolvedValue([
      { id: "m1", userId: "someone-else", projectId: null, workspaceId: null },
    ]);
    vi.mocked(getTranscriptionAccess).mockResolvedValue({} as never);
    vi.mocked(canEditTranscription).mockReturnValue(false);

    await expect(
      assignMeetingPlacement(db, USER, {
        meetingIds: ["m1"],
        projectId: "proj-1",
        scope: "editable",
      }),
    ).rejects.toThrow(TRPCError);
    expect(db.transcriptionSession.updateMany).not.toHaveBeenCalled();
  });

  it("owner scope only places meetings the caller owns, and never touches others' actions", async () => {
    vi.mocked(canEditProject).mockReturnValue(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.project.findUnique as any).mockResolvedValue({ workspaceId: "ws-A" });
    // Caller requested m1, m2, m3 but only owns m1 and m3.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.transcriptionSession.findMany as any).mockResolvedValue([
      { id: "m1" },
      { id: "m3" },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.transcriptionSession.updateMany as any).mockResolvedValue({ count: 2 });

    const result = await assignMeetingPlacement(db, USER, {
      meetingIds: ["m1", "m2", "m3"],
      projectId: "proj-1",
      scope: "owner",
    });

    expect(result.count).toBe(2);
    // Ownership lookup scoped to the caller.
    expect(db.transcriptionSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["m1", "m2", "m3"] }, userId: USER },
      }),
    );
    // Only the owned ids are written; the action update mirrors the owner guard.
    expect(db.transcriptionSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["m1", "m3"] }, userId: USER },
      }),
    );
    expect(db.action.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          transcriptionSessionId: { in: ["m1", "m3"] },
          transcriptionSession: { userId: USER },
        }),
      }),
    );
  });

  it("is a no-op for an empty meeting set", async () => {
    const result = await assignMeetingPlacement(db, USER, {
      meetingIds: [],
      projectId: "proj-1",
      scope: "owner",
    });

    expect(result.count).toBe(0);
    expect(getProjectAccess).not.toHaveBeenCalled();
    expect(db.transcriptionSession.updateMany).not.toHaveBeenCalled();
  });
});
