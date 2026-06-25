/**
 * Unit tests for the `getAssignableProjects` candidate resolver.
 *
 * Mocked Prisma (per CLAUDE.md "Test database safety"). The DB-level edit
 * filtering is exercised by `buildProjectEditWhere`'s own coverage and the
 * router integration tests; here we assert the service's contract: it scopes by
 * the edit where-clause, requests workspace data for grouping, and shapes each
 * row as `{ id, name, workspaceId, workspaceName }` (workspace-less → null).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { getAssignableProjects } from "../getAssignableProjects";
import { buildProjectEditWhere } from "~/server/services/access";

vi.mock("~/server/services/access", () => ({
  buildProjectEditWhere: vi.fn(() => ({ __editWhere: true })),
}));

const db = mockDeep<PrismaClient>();
const USER = "user-1";

beforeEach(() => {
  mockReset(db);
  vi.mocked(buildProjectEditWhere).mockClear();
});

describe("getAssignableProjects", () => {
  it("scopes the query to the caller's editable projects and groups by workspace", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.project.findMany as any).mockResolvedValue([
      { id: "p1", name: "Alpha", workspaceId: "ws-1", workspace: { name: "Acme" } },
      { id: "p2", name: "Beta", workspaceId: "ws-2", workspace: { name: "Beta Co" } },
    ]);

    const result = await getAssignableProjects(db, USER);

    expect(buildProjectEditWhere).toHaveBeenCalledWith(USER);
    expect(db.project.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { __editWhere: true },
        orderBy: [{ workspace: { name: "asc" } }, { name: "asc" }],
      }),
    );
    expect(result).toEqual([
      { id: "p1", name: "Alpha", workspaceId: "ws-1", workspaceName: "Acme" },
      { id: "p2", name: "Beta", workspaceId: "ws-2", workspaceName: "Beta Co" },
    ]);
  });

  it("maps a personal (workspace-less) project to null workspace fields", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.project.findMany as any).mockResolvedValue([
      { id: "p3", name: "Personal thing", workspaceId: null, workspace: null },
    ]);

    const result = await getAssignableProjects(db, USER);

    expect(result).toEqual([
      { id: "p3", name: "Personal thing", workspaceId: null, workspaceName: null },
    ]);
  });

  it("returns an empty list when the caller can edit nothing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.project.findMany as any).mockResolvedValue([]);

    expect(await getAssignableProjects(db, USER)).toEqual([]);
  });
});
