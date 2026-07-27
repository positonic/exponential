/**
 * Integration tests for the agent-facing mastra activity-write proxies.
 *
 * Real DB via Testcontainers. Asserts the agent path mirrors the human access
 * path (verifyGoalAccess): a user can post to any Objective they can access
 * (owner / workspace member), is rejected for an Objective they cannot access,
 * and the record is authored by the calling user. See ADR-0016.
 *
 * Prior art: `src/server/api/routers/__tests__/goal-outcome.integration.test.ts`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createGoal,
} from "~/test/factories";

describe("mastra.addGoalComment", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("posts a comment to an Objective the user owns, authored by the caller", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id, title: "Owned Objective" });

    const caller = createTestCaller(user.id);
    const comment = await caller.mastra.addGoalComment({
      goalId: goal.id,
      content: "Strategy summary from Zoe",
    });

    expect(comment.content).toBe("Strategy summary from Zoe");
    expect(comment.authorId).toBe(user.id);
    expect(comment.goalId).toBe(goal.id);

    const persisted = await db.goalComment.findUnique({ where: { id: comment.id } });
    expect(persisted?.authorId).toBe(user.id);
  });

  it("posts a comment to a shared workspace Objective the user did not create", async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id, slug: "comment-ws" });
    await addWorkspaceMember(db, ws.id, member.id, "member");
    const goal = await createGoal(db, {
      userId: owner.id,
      workspaceId: ws.id,
      title: "Shared Objective",
    });

    const memberCaller = createTestCaller(member.id);
    const comment = await memberCaller.mastra.addGoalComment({
      goalId: goal.id,
      content: "Note from a teammate via Zoe",
    });

    // Authored by the member who acted, not the goal's owner.
    expect(comment.authorId).toBe(member.id);
    expect(comment.goalId).toBe(goal.id);
  });

  it("rejects posting to an Objective the user cannot access", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const goal = await createGoal(db, { userId: owner.id, title: "Private Objective" });

    const strangerCaller = createTestCaller(stranger.id);
    await expect(
      strangerCaller.mastra.addGoalComment({
        goalId: goal.id,
        content: "should not be allowed",
      }),
    ).rejects.toThrow(/access denied/i);

    const count = await db.goalComment.count({ where: { goalId: goal.id } });
    expect(count).toBe(0);
  });

  it("does not modify the Objective's health when a comment is posted", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id, title: "Health-untouched Objective" });

    const before = await db.goal.findUnique({ where: { id: goal.id } });

    const caller = createTestCaller(user.id);
    await caller.mastra.addGoalComment({ goalId: goal.id, content: "just a note" });

    const after = await db.goal.findUnique({ where: { id: goal.id } });
    expect(after?.health).toBe(before?.health ?? null);
    expect(after?.healthUpdatedAt).toEqual(before?.healthUpdatedAt ?? null);
    expect(after?.healthOverride).toBe(before?.healthOverride ?? null);
  });
});

describe("mastra.addGoalUpdate", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("posts an update to an Objective the user owns and syncs its auto health", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id, title: "Owned Objective" });

    const caller = createTestCaller(user.id);
    const update = await caller.mastra.addGoalUpdate({
      goalId: goal.id,
      content: "Slipping on the launch KR",
      health: "at-risk",
    });

    expect(update.content).toBe("Slipping on the launch KR");
    expect(update.health).toBe("at-risk");
    expect(update.authorId).toBe(user.id);

    // The auto health cache moved; the manual override stayed null.
    const after = await db.goal.findUnique({ where: { id: goal.id } });
    expect(after?.health).toBe("at-risk");
    expect(after?.healthUpdatedAt).not.toBeNull();
    expect(after?.healthOverride).toBeNull();
  });

  it("leaves a set manual override intact (effective badge = override ?? health)", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id, title: "Pinned Objective" });
    // Pin a manual override via the drawer path (ADR-0004).
    await db.goal.update({
      where: { id: goal.id },
      data: { healthOverride: "on-track", healthOverrideById: user.id },
    });

    const caller = createTestCaller(user.id);
    await caller.mastra.addGoalUpdate({
      goalId: goal.id,
      content: "Actually we're behind",
      health: "off-track",
    });

    const after = await db.goal.findUnique({ where: { id: goal.id } });
    // Auto health reflects the update; the override is untouched.
    expect(after?.health).toBe("off-track");
    expect(after?.healthOverride).toBe("on-track");
  });

  it("posts to a shared workspace Objective the user did not create, authored by caller", async () => {
    const owner = await createUser(db);
    const member = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id, slug: "update-ws" });
    await addWorkspaceMember(db, ws.id, member.id, "member");
    const goal = await createGoal(db, {
      userId: owner.id,
      workspaceId: ws.id,
      title: "Shared Objective",
    });

    const memberCaller = createTestCaller(member.id);
    const update = await memberCaller.mastra.addGoalUpdate({
      goalId: goal.id,
      content: "Teammate check-in via Zoe",
      health: "on-track",
    });

    expect(update.authorId).toBe(member.id);
    expect(update.health).toBe("on-track");
  });

  it("rejects posting an update to an Objective the user cannot access", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const goal = await createGoal(db, { userId: owner.id, title: "Private Objective" });

    const strangerCaller = createTestCaller(stranger.id);
    await expect(
      strangerCaller.mastra.addGoalUpdate({
        goalId: goal.id,
        content: "should not be allowed",
        health: "off-track",
      }),
    ).rejects.toThrow(/access denied/i);

    const count = await db.goalUpdate.count({ where: { goalId: goal.id } });
    expect(count).toBe(0);
    // Health was not touched on the rejected write.
    const after = await db.goal.findUnique({ where: { id: goal.id } });
    expect(after?.health ?? null).toBeNull();
  });
});

describe("mastra.createFullCrmContact workspace resolution", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("creates the contact in the supplied workspace the caller is a member of", async () => {
    const user = await createUser(db);
    // The user belongs to two workspaces; without an explicit workspaceId the
    // endpoint's findFirst fallback could pick either. The explicit id must win.
    const wsA = await createWorkspace(db, { ownerId: user.id, slug: "crm-ws-a" });
    const wsB = await createWorkspace(db, { ownerId: user.id, slug: "crm-ws-b" });

    const caller = createTestCaller(user.id);
    const contact = await caller.mastra.createFullCrmContact({
      firstName: "Ada",
      lastName: "Lovelace",
      workspaceId: wsB.id,
    });

    const persisted = await db.crmContact.findUnique({ where: { id: contact.id } });
    expect(persisted?.workspaceId).toBe(wsB.id);
    expect(persisted?.workspaceId).not.toBe(wsA.id);
    expect(persisted?.createdById).toBe(user.id);
  });

  it("rejects a workspaceId the caller is not a member of", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const ownedWs = await createWorkspace(db, { ownerId: owner.id, slug: "crm-private-ws" });
    // The stranger has their own workspace so the findFirst fallback would
    // succeed — proving the rejection is about the explicit id, not "no workspace".
    await createWorkspace(db, { ownerId: stranger.id, slug: "crm-stranger-ws" });

    const strangerCaller = createTestCaller(stranger.id);
    await expect(
      strangerCaller.mastra.createFullCrmContact({
        firstName: "Mallory",
        workspaceId: ownedWs.id,
      }),
    ).rejects.toThrow(/not found or access denied/i);

    const count = await db.crmContact.count({ where: { workspaceId: ownedWs.id } });
    expect(count).toBe(0);
  });

  it("honors workspace access granted via team membership", async () => {
    const owner = await createUser(db);
    const teammate = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: owner.id, slug: "crm-team-ws" });
    // Grant the teammate workspace access via a team link (the resolver's
    // second access path), without a direct WorkspaceUser row.
    await db.team.create({
      data: {
        name: "CRM Team",
        slug: `crm-team-${ws.id}`,
        workspaceId: ws.id,
        members: { create: { userId: teammate.id, role: "member" } },
      },
    });

    const caller = createTestCaller(teammate.id);
    const contact = await caller.mastra.createFullCrmContact({
      firstName: "Grace",
      workspaceId: ws.id,
    });

    const persisted = await db.crmContact.findUnique({ where: { id: contact.id } });
    expect(persisted?.workspaceId).toBe(ws.id);
  });

  it("falls back to the user's first workspace when no workspaceId is supplied", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "crm-fallback-ws" });

    const caller = createTestCaller(user.id);
    const contact = await caller.mastra.createFullCrmContact({ firstName: "Edsger" });

    const persisted = await db.crmContact.findUnique({ where: { id: contact.id } });
    expect(persisted?.workspaceId).toBe(ws.id);
  });
});

describe("mastra.createCrmContact (legacy) workspace resolution", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("creates the contact in the supplied workspace the caller is a member of", async () => {
    const user = await createUser(db);
    const wsA = await createWorkspace(db, { ownerId: user.id, slug: "legacy-ws-a" });
    const wsB = await createWorkspace(db, { ownerId: user.id, slug: "legacy-ws-b" });

    const caller = createTestCaller(user.id);
    const result = await caller.mastra.createCrmContact({
      email: "ada@example.com",
      phone: "+15551230000",
      firstName: "Ada",
      workspaceId: wsB.id,
    });

    expect(result.created).toBe(true);
    const persisted = await db.crmContact.findUnique({ where: { id: result.contactId! } });
    expect(persisted?.workspaceId).toBe(wsB.id);
    expect(persisted?.workspaceId).not.toBe(wsA.id);
  });

  it("rejects a workspaceId the caller is not a member of", async () => {
    const owner = await createUser(db);
    const stranger = await createUser(db);
    const ownedWs = await createWorkspace(db, { ownerId: owner.id, slug: "legacy-private-ws" });
    await createWorkspace(db, { ownerId: stranger.id, slug: "legacy-stranger-ws" });

    const strangerCaller = createTestCaller(stranger.id);
    const result = await strangerCaller.mastra.createCrmContact({
      email: "mallory@example.com",
      phone: "+15559990000",
      workspaceId: ownedWs.id,
    });

    expect(result.created).toBe(false);
    expect(result.error).toMatch(/not found or access denied/i);
    const count = await db.crmContact.count({ where: { workspaceId: ownedWs.id } });
    expect(count).toBe(0);
  });

  it("falls back to the user's first workspace when no workspaceId is supplied", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "legacy-fallback-ws" });

    const caller = createTestCaller(user.id);
    const result = await caller.mastra.createCrmContact({
      email: "edsger@example.com",
      phone: "+15550001111",
    });

    expect(result.created).toBe(true);
    const persisted = await db.crmContact.findUnique({ where: { id: result.contactId! } });
    expect(persisted?.workspaceId).toBe(ws.id);
  });
});
