/**
 * Destination resolution: project → workspace, with Off as a distinct answer.
 *
 * The three outcomes lead to three different UIs — a room, a stated block, or a picker —
 * so collapsing any two of them would be a user-visible bug.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { resolveMatrixDestination } from "~/server/services/matrix/resolveMatrixDestination";

const PROJECT = "proj-1";
const WORKSPACE = "ws-1";

function link(overrides: Record<string, unknown> = {}) {
  return {
    id: "link-1",
    provider: "matrix",
    externalId: "!room:example.org",
    displayName: null,
    workspaceId: WORKSPACE,
    projectId: PROJECT,
    isActive: true,
    direction: "outbound",
    serverIntegrationId: "int-1",
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

let db: DeepMockProxy<PrismaClient>;

beforeEach(() => {
  db = mockDeep<PrismaClient>();
  mockReset(db);
});

/**
 * Answer findFirst from a small table, matching on the scalar keys of the where clause.
 * Lets these tests exercise the real predicates rather than a canned return value.
 */
function tableOf(rows: Record<string, unknown>[]) {
  return (args?: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    const match = rows.find((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    );
    return Promise.resolve(match ?? null);
  };
}

describe("resolveMatrixDestination", () => {
  it("uses the project's binding when it has one", async () => {
    const projectRow = link({ externalId: "!project-room:example.org" });
    const workspaceRow = link({
      id: "link-ws",
      projectId: null,
      externalId: "!workspace-room:example.org",
    });
    db.channelLink.findFirst.mockImplementation(
      tableOf([projectRow, workspaceRow]) as never,
    );

    const result = await resolveMatrixDestination(db, {
      projectId: PROJECT,
      workspaceId: WORKSPACE,
    });

    expect(result).toMatchObject({ kind: "room" });
    expect((result as { link: { externalId: string } }).link.externalId).toBe(
      "!project-room:example.org",
    );
  });

  it("falls back to the workspace default when the project has no binding", async () => {
    const workspaceRow = link({
      id: "link-ws",
      projectId: null,
      externalId: "!workspace-room:example.org",
    });
    db.channelLink.findFirst.mockImplementation(tableOf([workspaceRow]) as never);

    const result = await resolveMatrixDestination(db, {
      projectId: PROJECT,
      workspaceId: WORKSPACE,
    });

    expect((result as { link: { externalId: string } }).link.externalId).toBe(
      "!workspace-room:example.org",
    );
  });

  it("treats an inactive project row as Off, and does NOT fall through to the workspace", async () => {
    // The whole point of Off: a confidential project must not inherit the default.
    const offRow = link({ isActive: false });
    const workspaceRow = link({
      id: "link-ws",
      projectId: null,
      externalId: "!workspace-room:example.org",
    });
    db.channelLink.findFirst.mockImplementation(
      tableOf([offRow, workspaceRow]) as never,
    );

    await expect(
      resolveMatrixDestination(db, { projectId: PROJECT, workspaceId: WORKSPACE }),
    ).resolves.toEqual({ kind: "off" });
  });

  it("reports none when nothing is configured anywhere", async () => {
    db.channelLink.findFirst.mockImplementation(tableOf([]) as never);

    await expect(
      resolveMatrixDestination(db, { projectId: PROJECT, workspaceId: WORKSPACE }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("ships unset: a workspace with no default resolves to none, so nothing posts by accident", async () => {
    db.channelLink.findFirst.mockImplementation(tableOf([]) as never);

    await expect(
      resolveMatrixDestination(db, { projectId: null, workspaceId: WORKSPACE }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("ignores inbound rows — those answer the opposite question", async () => {
    const inboundRow = link({ direction: "inbound" });
    db.channelLink.findFirst.mockImplementation(tableOf([inboundRow]) as never);

    await expect(
      resolveMatrixDestination(db, { projectId: PROJECT, workspaceId: WORKSPACE }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("ignores another provider's rows", async () => {
    const whatsapp = link({ provider: "whatsapp" });
    db.channelLink.findFirst.mockImplementation(tableOf([whatsapp]) as never);

    await expect(
      resolveMatrixDestination(db, { projectId: PROJECT, workspaceId: WORKSPACE }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("resolves to none for a meeting with neither project nor workspace", async () => {
    await expect(
      resolveMatrixDestination(db, { projectId: null, workspaceId: null }),
    ).resolves.toEqual({ kind: "none" });
    expect(db.channelLink.findFirst).not.toHaveBeenCalled();
  });

  it("does not treat an inactive workspace default as Off", async () => {
    // Off is a project-level concept. An inactive workspace row just means no default.
    const inactiveWorkspaceRow = link({
      id: "link-ws",
      projectId: null,
      isActive: false,
    });
    db.channelLink.findFirst.mockImplementation(
      tableOf([inactiveWorkspaceRow]) as never,
    );

    await expect(
      resolveMatrixDestination(db, { projectId: PROJECT, workspaceId: WORKSPACE }),
    ).resolves.toEqual({ kind: "none" });
  });
});
