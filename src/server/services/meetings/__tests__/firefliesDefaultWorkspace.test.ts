/**
 * The Fireflies "File new meetings into" setting: how it is stored in
 * `providerConfig`, and that applying it on import can never fail the import.
 * The placement write itself is covered by assignMeetingPlacement.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { fileImportIntoDefaultWorkspaceMock } = vi.hoisted(() => ({
  fileImportIntoDefaultWorkspaceMock: vi.fn(),
}));

vi.mock("../assignMeetingPlacement", () => ({
  fileImportIntoDefaultWorkspace: fileImportIntoDefaultWorkspaceMock,
}));

import {
  fileFirefliesImport,
  readFirefliesMeetingWorkspaceId,
  withFirefliesMeetingWorkspaceId,
} from "../firefliesDefaultWorkspace";

const db = mockDeep<PrismaClient>();

describe("readFirefliesMeetingWorkspaceId", () => {
  it("reads the configured id and treats anything else as unset", () => {
    expect(readFirefliesMeetingWorkspaceId({ meetingWorkspaceId: "ws-1" })).toBe("ws-1");
    expect(readFirefliesMeetingWorkspaceId({ meetingWorkspaceId: "" })).toBeNull();
    expect(readFirefliesMeetingWorkspaceId({ meetingWorkspaceId: 7 })).toBeNull();
    expect(readFirefliesMeetingWorkspaceId({})).toBeNull();
    expect(readFirefliesMeetingWorkspaceId(null)).toBeNull();
    expect(readFirefliesMeetingWorkspaceId(["ws-1"])).toBeNull();
  });
});

describe("withFirefliesMeetingWorkspaceId", () => {
  it("sets and clears the id without disturbing other config", () => {
    expect(withFirefliesMeetingWorkspaceId({ other: 1 }, "ws-1")).toEqual({
      other: 1,
      meetingWorkspaceId: "ws-1",
    });
    expect(withFirefliesMeetingWorkspaceId({ other: 1, meetingWorkspaceId: "ws-1" }, null)).toEqual({
      other: 1,
    });
    expect(withFirefliesMeetingWorkspaceId(null, "ws-1")).toEqual({ meetingWorkspaceId: "ws-1" });
  });
});

describe("fileFirefliesImport", () => {
  beforeEach(() => {
    mockReset(db);
    fileImportIntoDefaultWorkspaceMock.mockReset();
  });

  it("files the meeting into the integration's configured workspace", async () => {
    db.integration.findUnique.mockResolvedValue({ providerConfig: { meetingWorkspaceId: "ws-1" } } as never);
    fileImportIntoDefaultWorkspaceMock.mockResolvedValue("ws-1");

    const result = await fileFirefliesImport(db, {
      meetingId: "m1",
      ownerUserId: "u1",
      integrationId: "int-1",
    });

    expect(result).toBe("ws-1");
    expect(fileImportIntoDefaultWorkspaceMock).toHaveBeenCalledWith(db, {
      meetingId: "m1",
      ownerUserId: "u1",
      workspaceId: "ws-1",
    });
  });

  it("passes no workspace when the integration has none set", async () => {
    db.integration.findUnique.mockResolvedValue({ providerConfig: null } as never);
    fileImportIntoDefaultWorkspaceMock.mockResolvedValue(null);

    await fileFirefliesImport(db, { meetingId: "m1", ownerUserId: "u1", integrationId: "int-1" });

    expect(fileImportIntoDefaultWorkspaceMock).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ workspaceId: null }),
    );
  });

  it("never throws, leaving the meeting Personal", async () => {
    db.integration.findUnique.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      fileFirefliesImport(db, { meetingId: "m1", ownerUserId: "u1", integrationId: "int-1" }),
    ).resolves.toBeNull();
  });
});
