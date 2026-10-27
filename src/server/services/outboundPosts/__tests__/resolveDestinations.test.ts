/**
 * Outbound destination resolution: project → workspace, per kind, Off as a distinct
 * answer, restricted projects failing closed (ADR-0075).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { resolveOutboundDestination } from "~/server/services/outboundPosts/resolveDestinations";

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
    kind: "decision",
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
  db.project.findUnique.mockResolvedValue({ isRestricted: false } as never);
});

/** Answer findFirst from a small table on the scalar keys of the where clause. */
function tableOf(rows: Record<string, unknown>[]) {
  return (args?: { where?: Record<string, unknown> }) => {
    const where = args?.where ?? {};
    const match = rows.find((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    );
    return Promise.resolve(match ?? null);
  };
}

describe("resolveOutboundDestination", () => {
  it("uses the project's binding for the kind when it has one", async () => {
    db.channelLink.findFirst.mockImplementation(
      tableOf([
        link({ externalId: "!decisions-proj:example.org" }),
        link({ id: "ws", projectId: null, externalId: "!decisions-ws:example.org" }),
      ]) as never,
    );

    const result = await resolveOutboundDestination(db, {
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      kind: "decision",
    });

    expect(result).toMatchObject({ kind: "room" });
    expect((result as { link: { externalId: string } }).link.externalId).toBe(
      "!decisions-proj:example.org",
    );
  });

  it("never answers from a binding of another kind", async () => {
    // A project with only a meeting-summary room must not get decisions posted into it.
    db.channelLink.findFirst.mockImplementation(
      tableOf([
        link({ kind: "meeting_summary", externalId: "!meetings:example.org" }),
        link({ id: "ws", projectId: null, kind: "meeting_summary", externalId: "!ws-meetings:example.org" }),
      ]) as never,
    );

    await expect(
      resolveOutboundDestination(db, { workspaceId: WORKSPACE, projectId: PROJECT, kind: "decision" }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("falls back to the workspace default of the same kind", async () => {
    db.channelLink.findFirst.mockImplementation(
      tableOf([
        link({ id: "ws", projectId: null, externalId: "!decisions-ws:example.org" }),
        link({ id: "ws-m", projectId: null, kind: "meeting_summary", externalId: "!ws-meetings:example.org" }),
      ]) as never,
    );

    const result = await resolveOutboundDestination(db, {
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      kind: "decision",
    });

    expect((result as { link: { externalId: string } }).link.externalId).toBe(
      "!decisions-ws:example.org",
    );
  });

  it("treats an inactive project row as Off and does not fall through", async () => {
    db.channelLink.findFirst.mockImplementation(
      tableOf([
        link({ isActive: false }),
        link({ id: "ws", projectId: null, externalId: "!decisions-ws:example.org" }),
      ]) as never,
    );

    await expect(
      resolveOutboundDestination(db, { workspaceId: WORKSPACE, projectId: PROJECT, kind: "decision" }),
    ).resolves.toEqual({ kind: "off" });
  });

  it("switches one kind Off without switching the other", async () => {
    db.channelLink.findFirst.mockImplementation(
      tableOf([
        link({ kind: "decision", isActive: false }),
        link({ id: "m", kind: "meeting_summary", externalId: "!meetings:example.org" }),
      ]) as never,
    );

    await expect(
      resolveOutboundDestination(db, { workspaceId: WORKSPACE, projectId: PROJECT, kind: "decision" }),
    ).resolves.toEqual({ kind: "off" });
    await expect(
      resolveOutboundDestination(db, { workspaceId: WORKSPACE, projectId: PROJECT, kind: "meeting_summary" }),
    ).resolves.toMatchObject({ kind: "room" });
  });

  it("fails closed for a restricted project on Inherit", async () => {
    db.project.findUnique.mockResolvedValue({ isRestricted: true } as never);
    db.channelLink.findFirst.mockImplementation(
      tableOf([link({ id: "ws", projectId: null, externalId: "!decisions-ws:example.org" })]) as never,
    );

    await expect(
      resolveOutboundDestination(db, { workspaceId: WORKSPACE, projectId: PROJECT, kind: "decision" }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("posts for a restricted project through its own explicit binding", async () => {
    db.project.findUnique.mockResolvedValue({ isRestricted: true } as never);
    db.channelLink.findFirst.mockImplementation(
      tableOf([link({ externalId: "!private:example.org" })]) as never,
    );

    const result = await resolveOutboundDestination(db, {
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      kind: "decision",
    });

    expect((result as { link: { externalId: string } }).link.externalId).toBe(
      "!private:example.org",
    );
  });

  it("can be told not to fail closed (the meeting-summary wrapper keeps shipped behaviour)", async () => {
    db.project.findUnique.mockResolvedValue({ isRestricted: true } as never);
    db.channelLink.findFirst.mockImplementation(
      tableOf([link({ id: "ws", projectId: null, kind: "meeting_summary" })]) as never,
    );

    await expect(
      resolveOutboundDestination(db, {
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        kind: "meeting_summary",
        failClosedWhenRestricted: false,
      }),
    ).resolves.toMatchObject({ kind: "room" });
    expect(db.project.findUnique).not.toHaveBeenCalled();
  });

  it("filters by provider when asked", async () => {
    db.channelLink.findFirst.mockImplementation(
      tableOf([link({ id: "ws", projectId: null, provider: "slack", externalId: "C123" })]) as never,
    );

    await expect(
      resolveOutboundDestination(db, {
        workspaceId: WORKSPACE,
        projectId: null,
        kind: "decision",
        provider: "matrix",
      }),
    ).resolves.toEqual({ kind: "none" });
    await expect(
      resolveOutboundDestination(db, { workspaceId: WORKSPACE, projectId: null, kind: "decision" }),
    ).resolves.toMatchObject({ kind: "room" });
  });

  it("ignores inbound rows and inactive workspace defaults", async () => {
    db.channelLink.findFirst.mockImplementation(
      tableOf([
        link({ direction: "inbound" }),
        link({ id: "ws", projectId: null, isActive: false }),
      ]) as never,
    );

    await expect(
      resolveOutboundDestination(db, { workspaceId: WORKSPACE, projectId: PROJECT, kind: "decision" }),
    ).resolves.toEqual({ kind: "none" });
  });

  it("resolves to none with neither project nor workspace, without querying", async () => {
    await expect(
      resolveOutboundDestination(db, { workspaceId: null, projectId: null, kind: "decision" }),
    ).resolves.toEqual({ kind: "none" });
    expect(db.channelLink.findFirst).not.toHaveBeenCalled();
  });
});
