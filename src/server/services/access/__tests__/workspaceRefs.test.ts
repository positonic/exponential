/**
 * Unit tests for the cross-workspace link guard.
 *
 * Covers the sideways route to the 2026-08-04 epic audit finding: a ticket or
 * action in workspace A must not be able to point at an epic (or feature,
 * cycle, scope) in workspace B, because the pointed-at row's fields come back
 * inside the pointing row's own include.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

import { assertWorkspaceScopedRefs } from "../workspaceRefs";

const WORKSPACE_ID = "ws-1";
const OTHER_WORKSPACE_ID = "ws-2";

describe("assertWorkspaceScopedRefs", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
  });

  it("is a no-op when no references are supplied", async () => {
    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, {}),
    ).resolves.toBeUndefined();
    expect(db.epic.findUnique).not.toHaveBeenCalled();
  });

  it("skips null/undefined references so unlinking stays allowed", async () => {
    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, {
        epicId: null,
        featureId: undefined,
      }),
    ).resolves.toBeUndefined();
    expect(db.epic.findUnique).not.toHaveBeenCalled();
    expect(db.feature.findUnique).not.toHaveBeenCalled();
  });

  it("accepts an epic in the same workspace", async () => {
    db.epic.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID } as never);

    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, { epicId: "epic-1" }),
    ).resolves.toBeUndefined();
  });

  it("rejects an epic from another workspace without confirming it exists", async () => {
    db.epic.findUnique.mockResolvedValue({
      workspaceId: OTHER_WORKSPACE_ID,
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, { epicId: "epic-foreign" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Epic not found in this workspace",
    });
  });

  it("rejects an epic id that does not exist at all", async () => {
    db.epic.findUnique.mockResolvedValue(null as never);

    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, { epicId: "nope" }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejects any workspace-scoped reference when the pointing row has no workspace", async () => {
    db.epic.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID } as never);

    await expect(
      assertWorkspaceScopedRefs(db, null, { epicId: "epic-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("resolves a feature through its product's workspace", async () => {
    db.feature.findUnique.mockResolvedValue({
      product: { workspaceId: OTHER_WORKSPACE_ID },
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, { featureId: "feat-1" }),
    ).rejects.toMatchObject({ message: "Feature not found in this workspace" });
  });

  it("resolves a cycle through its List row", async () => {
    db.list.findUnique.mockResolvedValue({
      workspaceId: OTHER_WORKSPACE_ID,
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, { cycleId: "cycle-1" }),
    ).rejects.toMatchObject({ message: "Cycle not found in this workspace" });
  });

  it("resolves a scope through feature → product → workspace", async () => {
    db.featureScope.findUnique.mockResolvedValue({
      feature: { product: { workspaceId: WORKSPACE_ID } },
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, { scopeId: "scope-1" }),
    ).resolves.toBeUndefined();
  });

  it("rejects when any one of several references is foreign", async () => {
    db.epic.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID } as never);
    db.feature.findUnique.mockResolvedValue({
      product: { workspaceId: WORKSPACE_ID },
    } as never);
    db.list.findUnique.mockResolvedValue({
      workspaceId: OTHER_WORKSPACE_ID,
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, WORKSPACE_ID, {
        epicId: "epic-1",
        featureId: "feat-1",
        cycleId: "cycle-foreign",
      }),
    ).rejects.toMatchObject({ message: "Cycle not found in this workspace" });
  });
});
