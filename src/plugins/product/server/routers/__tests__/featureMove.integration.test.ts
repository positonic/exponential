/**
 * Integration tests for the `feature.move` transactional cascade (ADR-0027).
 *
 * Exercises the real end-to-end move against a testcontainers Postgres: tickets
 * renumbered into the destination Product; cycles / dependencies / assignees /
 * child-action links in their expected end-state; transaction atomicity (a
 * forced mid-transaction failure leaves the source Feature untouched); and
 * access denial when the caller lacks destination membership.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { getTestDb } from "~/test/test-db";
import { createTestCaller, createMockCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createProduct,
  createFeature,
  createTicket,
  createGoal,
  createTag,
  createCycle,
  createAction,
} from "~/test/factories";

describe("feature.move (integration)", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("moves a feature with tickets, renumbering and severing relations end-to-end", async () => {
    const mover = await createUser(db);
    const destMember = await createUser(db);
    const stranger = await createUser(db);

    // Source workspace + product (mover is owner).
    const srcWs = await createWorkspace(db, { ownerId: mover.id });
    const srcProduct = await createProduct(db, {
      workspaceId: srcWs.id,
      createdById: mover.id,
    });

    // Destination workspace + product. Mover and destMember belong; stranger
    // does not. Seed a pre-existing ticket so renumbering must avoid it.
    const destWs = await createWorkspace(db, { ownerId: mover.id });
    await addWorkspaceMember(db, destWs.id, destMember.id, "member");
    const destProduct = await createProduct(db, {
      workspaceId: destWs.id,
      createdById: mover.id,
    });
    await createTicket(db, {
      productId: destProduct.id,
      createdById: mover.id,
      number: 1,
    });

    // Feature with a goal, an insight link, and one ws-scoped + one global tag.
    const goal = await createGoal(db, {
      userId: mover.id,
      workspaceId: srcWs.id,
      title: "Source goal",
    });
    const feature = await createFeature(db, {
      productId: srcProduct.id,
      createdById: mover.id,
    });
    await db.feature.update({
      where: { id: feature.id },
      data: { goalId: goal.id },
    });
    const insight = await db.insight.create({
      data: {
        productId: srcProduct.id,
        type: "OPPORTUNITY",
        title: "Source insight",
        createdById: mover.id,
      },
    });
    await db.featureInsight.create({
      data: { featureId: feature.id, insightId: insight.id },
    });
    const wsTag = await createTag(db, { workspaceId: srcWs.id });
    const globalTag = await createTag(db, {}); // workspaceId null = global
    await db.featureTag.createMany({
      data: [
        { featureId: feature.id, tagId: wsTag.id },
        { featureId: feature.id, tagId: globalTag.id },
      ],
    });

    // Cycle (source-product scoped) for tk1.
    const cycle = await createCycle(db, {
      workspaceId: srcWs.id,
      createdById: mover.id,
    });

    // Moving tickets: tk1 (cycle + dest-member assignee), tk2 (stranger
    // assignee + a child action). Plus tk3 left behind (not in the feature).
    const tk1 = await createTicket(db, {
      productId: srcProduct.id,
      createdById: mover.id,
      featureId: feature.id,
      number: 10,
      cycleId: cycle.id,
      assigneeId: destMember.id,
    });
    const tk2 = await createTicket(db, {
      productId: srcProduct.id,
      createdById: mover.id,
      featureId: feature.id,
      number: 11,
      assigneeId: stranger.id,
    });
    const tk3 = await createTicket(db, {
      productId: srcProduct.id,
      createdById: mover.id,
      number: 12,
    });

    const action = await createAction(db, { createdById: mover.id });
    await db.action.update({
      where: { id: action.id },
      data: { ticketId: tk2.id },
    });

    // Dependencies: tk1↔tk2 both move (preserved); tk1→tk3 crosses (dropped).
    await db.ticketDependency.create({
      data: { ticketId: tk1.id, dependsOnId: tk2.id },
    });
    await db.ticketDependency.create({
      data: { ticketId: tk1.id, dependsOnId: tk3.id },
    });

    const caller = createTestCaller(mover.id);
    const res = await caller.product.feature.move({
      featureId: feature.id,
      destinationProductId: destProduct.id,
    });
    expect(res.workspaceSlug).toBe(destWs.slug);
    expect(res.productSlug).toBe(destProduct.slug);

    // Feature re-pointed; goal alignment dropped.
    const movedFeature = await db.feature.findUniqueOrThrow({
      where: { id: feature.id },
    });
    expect(movedFeature.productId).toBe(destProduct.id);
    expect(movedFeature.goalId).toBeNull();

    // Insight links dropped; ws tag dropped; global tag kept.
    expect(await db.featureInsight.count({ where: { featureId: feature.id } })).toBe(0);
    const remainingTags = await db.featureTag.findMany({
      where: { featureId: feature.id },
    });
    expect(remainingTags.map((t) => t.tagId)).toEqual([globalTag.id]);

    // Tickets re-pointed + renumbered uniquely (above the dest's used number 1).
    const movedTk1 = await db.ticket.findUniqueOrThrow({ where: { id: tk1.id } });
    const movedTk2 = await db.ticket.findUniqueOrThrow({ where: { id: tk2.id } });
    expect(movedTk1.productId).toBe(destProduct.id);
    expect(movedTk2.productId).toBe(destProduct.id);
    expect(movedTk1.number).toBeGreaterThan(1);
    expect(movedTk2.number).toBeGreaterThan(1);
    expect(movedTk1.number).not.toBe(movedTk2.number);

    // Cycle nulled.
    expect(movedTk1.cycleId).toBeNull();

    // Assignee kept for the dest member, cleared for the stranger.
    expect(movedTk1.assigneeId).toBe(destMember.id);
    expect(movedTk2.assigneeId).toBeNull();

    // Intra-set dependency preserved; cross-boundary dependency dropped.
    const deps = await db.ticketDependency.findMany({
      where: { OR: [{ ticketId: tk1.id }, { dependsOnId: tk1.id }] },
    });
    expect(deps).toHaveLength(1);
    expect(deps[0]!.dependsOnId).toBe(tk2.id);

    // Child action unlinked but not deleted; still in source workspace.
    const movedAction = await db.action.findUniqueOrThrow({
      where: { id: action.id },
    });
    expect(movedAction.ticketId).toBeNull();

    // tk3 untouched in the source product.
    const leftBehind = await db.ticket.findUniqueOrThrow({ where: { id: tk3.id } });
    expect(leftBehind.productId).toBe(srcProduct.id);
    expect(leftBehind.featureId).toBeNull();
  });

  it("rejects a move when the caller is not a member of the destination workspace", async () => {
    const mover = await createUser(db);
    const other = await createUser(db);

    const srcWs = await createWorkspace(db, { ownerId: mover.id });
    const srcProduct = await createProduct(db, {
      workspaceId: srcWs.id,
      createdById: mover.id,
    });
    const feature = await createFeature(db, {
      productId: srcProduct.id,
      createdById: mover.id,
    });

    // Destination workspace the mover does NOT belong to.
    const destWs = await createWorkspace(db, { ownerId: other.id });
    const destProduct = await createProduct(db, {
      workspaceId: destWs.id,
      createdById: other.id,
    });

    const caller = createTestCaller(mover.id);
    await expect(
      caller.product.feature.move({
        featureId: feature.id,
        destinationProductId: destProduct.id,
      }),
    ).rejects.toThrow(TRPCError);

    // Feature untouched.
    const unchanged = await db.feature.findUniqueOrThrow({ where: { id: feature.id } });
    expect(unchanged.productId).toBe(srcProduct.id);
  });

  it("rolls back the whole move when a mid-transaction write fails", async () => {
    const mover = await createUser(db);
    const srcWs = await createWorkspace(db, { ownerId: mover.id });
    const srcProduct = await createProduct(db, {
      workspaceId: srcWs.id,
      createdById: mover.id,
    });
    const destWs = await createWorkspace(db, { ownerId: mover.id });
    const destProduct = await createProduct(db, {
      workspaceId: destWs.id,
      createdById: mover.id,
    });

    const feature = await createFeature(db, {
      productId: srcProduct.id,
      createdById: mover.id,
    });
    const tk = await createTicket(db, {
      productId: srcProduct.id,
      createdById: mover.id,
      featureId: feature.id,
      number: 5,
    });

    // Wrap the real test DB so the interactive transaction's `feature.update`
    // throws — after the ticket update has already run — forcing a rollback.
    const failingDb = makeDbFailingOn(db, "feature", "update");
    const caller = createMockCaller({ userId: mover.id, db: failingDb });

    await expect(
      caller.product.feature.move({
        featureId: feature.id,
        destinationProductId: destProduct.id,
      }),
    ).rejects.toThrow();

    // Nothing committed: feature and ticket are still in the source product.
    const f = await db.feature.findUniqueOrThrow({ where: { id: feature.id } });
    expect(f.productId).toBe(srcProduct.id);
    const t = await db.ticket.findUniqueOrThrow({ where: { id: tk.id } });
    expect(t.productId).toBe(srcProduct.id);
    expect(t.number).toBe(5);
  });
});

/**
 * Wrap a real PrismaClient so that, inside an interactive `$transaction`, calls
 * to `tx[model][method]` throw. Everything else forwards to the real client.
 * Used to force a deterministic mid-transaction failure for the rollback test.
 */
function makeDbFailingOn(
  realDb: PrismaClient,
  model: string,
  method: string,
): PrismaClient {
  const bind = (obj: unknown, prop: string | symbol) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val = (obj as any)[prop];
    return typeof val === "function" ? val.bind(obj) : val;
  };
  return new Proxy(realDb, {
    get(target, prop) {
      if (prop === "$transaction") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (arg: any, opts: any) => {
          if (typeof arg === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (target as any).$transaction((tx: any) => {
              const wrappedTx = new Proxy(tx, {
                get(t, p) {
                  if (p === model) {
                    return new Proxy(t[model], {
                      get(m, mp) {
                        if (mp === method) {
                          return () => {
                            throw new Error("injected mid-transaction failure");
                          };
                        }
                        return bind(m, mp);
                      },
                    });
                  }
                  return bind(t, p);
                },
              });
              return arg(wrappedTx);
            }, opts);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (target as any).$transaction(arg, opts);
        };
      }
      return bind(target, prop);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
}
