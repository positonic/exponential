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

const USER_ID = "user-1";
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
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, {}),
    ).resolves.toBeUndefined();
    expect(db.epic.findUnique).not.toHaveBeenCalled();
  });

  it("skips null/undefined references so unlinking stays allowed", async () => {
    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, {
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
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, { epicId: "epic-1" }),
    ).resolves.toBeUndefined();
  });

  it("rejects an epic from another workspace without confirming it exists", async () => {
    db.epic.findUnique.mockResolvedValue({
      workspaceId: OTHER_WORKSPACE_ID,
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, { epicId: "epic-foreign" }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Epic not found in this workspace",
    });
  });

  it("rejects an epic id that does not exist at all", async () => {
    db.epic.findUnique.mockResolvedValue(null as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, { epicId: "nope" }),
    ).rejects.toBeInstanceOf(TRPCError);
  });

  // A workspace-less action (no workspaceId, no project) has no containment
  // rule to apply, so membership in the reference's workspace is the check.
  // EditActionModal offers the context workspace's epics for these actions.
  it("accepts a reference for a workspace-less row when the caller is a member", async () => {
    db.epic.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID } as never);
    db.workspaceUser.findUnique.mockResolvedValue({
      role: "member",
      workspaceId: WORKSPACE_ID,
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, null, { epicId: "epic-1" }),
    ).resolves.toBeUndefined();
  });

  it("rejects a reference for a workspace-less row when the caller is not a member", async () => {
    db.epic.findUnique.mockResolvedValue({
      workspaceId: OTHER_WORKSPACE_ID,
    } as never);
    db.workspaceUser.findUnique.mockResolvedValue(null as never);
    db.teamUser.findFirst.mockResolvedValue(null as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, null, { epicId: "epic-foreign" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("admits a team-based member on the workspace-less path", async () => {
    db.epic.findUnique.mockResolvedValue({ workspaceId: WORKSPACE_ID } as never);
    db.workspaceUser.findUnique.mockResolvedValue(null as never);
    db.teamUser.findFirst.mockResolvedValue({
      role: "member",
      team: { workspaceId: WORKSPACE_ID },
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, null, { epicId: "epic-1" }),
    ).resolves.toBeUndefined();
  });

  it("does not consult membership when the pointing row has a workspace", async () => {
    db.epic.findUnique.mockResolvedValue({
      workspaceId: OTHER_WORKSPACE_ID,
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, { epicId: "epic-1" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Containment is the whole rule here — being a member of the epic's
    // workspace must not let you link it into a different workspace's ticket.
    expect(db.workspaceUser.findUnique).not.toHaveBeenCalled();
  });

  it("resolves a feature through its product's workspace", async () => {
    db.feature.findUnique.mockResolvedValue({
      product: { workspaceId: OTHER_WORKSPACE_ID },
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, { featureId: "feat-1" }),
    ).rejects.toMatchObject({ message: "Feature not found in this workspace" });
  });

  it("resolves a cycle through its List row", async () => {
    db.list.findUnique.mockResolvedValue({
      workspaceId: OTHER_WORKSPACE_ID,
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, { cycleId: "cycle-1" }),
    ).rejects.toMatchObject({ message: "Cycle not found in this workspace" });
  });

  it("resolves a scope through feature → product → workspace", async () => {
    db.featureScope.findUnique.mockResolvedValue({
      feature: { product: { workspaceId: WORKSPACE_ID } },
    } as never);

    await expect(
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, { scopeId: "scope-1" }),
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
      assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, {
        epicId: "epic-1",
        featureId: "feat-1",
        cycleId: "cycle-foreign",
      }),
    ).rejects.toMatchObject({ message: "Cycle not found in this workspace" });
  });

  // Epics are per-product. Same workspace is no longer sufficient for a
  // ticket → epic link; the epic has to belong to the ticket's own product.
  describe("product containment for epics", () => {
    const PRODUCT_ID = "prod-1";
    const OTHER_PRODUCT_ID = "prod-2";

    it("admits an epic in the pointing ticket's own product", async () => {
      db.epic.findUnique.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        productId: PRODUCT_ID,
      } as never);

      await expect(
        assertWorkspaceScopedRefs(
          db,
          USER_ID,
          WORKSPACE_ID,
          { epicId: "epic-1" },
          PRODUCT_ID,
        ),
      ).resolves.toBeUndefined();
    });

    it("rejects another product's epic even inside one workspace", async () => {
      db.epic.findUnique.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        productId: OTHER_PRODUCT_ID,
      } as never);

      await expect(
        assertWorkspaceScopedRefs(
          db,
          USER_ID,
          WORKSPACE_ID,
          { epicId: "epic-1" },
          PRODUCT_ID,
        ),
      ).rejects.toMatchObject({ message: "Epic not found in this product" });
    });

    it("still admits a product-less epic during the backfill window", async () => {
      db.epic.findUnique.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        productId: null,
      } as never);

      await expect(
        assertWorkspaceScopedRefs(
          db,
          USER_ID,
          WORKSPACE_ID,
          { epicId: "epic-1" },
          PRODUCT_ID,
        ),
      ).resolves.toBeUndefined();
    });

    it("ignores product containment when the caller has no product (actions)", async () => {
      db.epic.findUnique.mockResolvedValue({
        workspaceId: WORKSPACE_ID,
        productId: OTHER_PRODUCT_ID,
      } as never);

      // An Action has no product of its own, so workspace containment is the
      // only rule that can apply to it.
      await expect(
        assertWorkspaceScopedRefs(db, USER_ID, WORKSPACE_ID, {
          epicId: "epic-1",
        }),
      ).resolves.toBeUndefined();
    });
  });
});
