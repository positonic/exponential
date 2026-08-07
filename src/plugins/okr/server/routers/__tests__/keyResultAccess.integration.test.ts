import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createGoal,
  createTeam,
} from "~/test/factories";

/**
 * `okr` is the KEY RESULT router (objectives live on `goal`). These tests pin
 * down two fixes:
 *
 *   - `getAll` accepted a `workspaceId` but still filtered by `userId`, so a
 *     member got `[]` for a colleague's key results. It now mirrors
 *     `getByObjective`: validate membership, then return the workspace's KRs.
 *   - `create`/`update`/`checkIn`/`delete` were owner-only while `linkProject`
 *     and `linkFeature` already allowed owner OR workspace member. A teammate
 *     could attach work to a KR but never move its value, which blocks
 *     agent-driven check-ins entirely.
 */
async function seedWorkspaceKeyResult(db: ReturnType<typeof getTestDb>) {
  const owner = await createUser(db);
  const member = await createUser(db);
  const stranger = await createUser(db);
  const ws = await createWorkspace(db, { ownerId: owner.id });
  await addWorkspaceMember(db, ws.id, member.id);
  const goal = await createGoal(db, {
    userId: owner.id,
    workspaceId: ws.id,
    title: "Grow activation",
  });
  const keyResult = await db.keyResult.create({
    data: {
      goalId: goal.id,
      userId: owner.id,
      workspaceId: ws.id,
      title: "Weekly active teams 40 → 120",
      startValue: 40,
      currentValue: 40,
      targetValue: 120,
      unit: "count",
      period: "Q3-2026",
    },
  });
  return { owner, member, stranger, ws, goal, keyResult };
}

describe("okr.getAll workspace scoping", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("returns a colleague's key results to a workspace member", async () => {
    const { member, ws, keyResult } = await seedWorkspaceKeyResult(db);

    const results = await createTestCaller(member.id).okr.getAll({
      workspaceId: ws.id,
    });

    expect(results.map((kr) => kr.id)).toEqual([keyResult.id]);
  });

  it("narrows back to the caller's own key results with onlyMine", async () => {
    const { member, ws } = await seedWorkspaceKeyResult(db);

    const results = await createTestCaller(member.id).okr.getAll({
      workspaceId: ws.id,
      onlyMine: true,
    });

    expect(results).toEqual([]);
  });

  it("rejects a non-member", async () => {
    const { stranger, ws } = await seedWorkspaceKeyResult(db);

    await expect(
      createTestCaller(stranger.id).okr.getAll({ workspaceId: ws.id }),
    ).rejects.toThrow(/access/i);
  });

  it("still returns only the caller's own key results with no workspaceId", async () => {
    const { member } = await seedWorkspaceKeyResult(db);

    const results = await createTestCaller(member.id).okr.getAll();

    expect(results).toEqual([]);
  });

  it("filters by goal, period and status", async () => {
    const { owner, ws, goal, keyResult } = await seedWorkspaceKeyResult(db);
    await db.keyResult.create({
      data: {
        goalId: goal.id,
        userId: owner.id,
        workspaceId: ws.id,
        title: "Different period",
        targetValue: 10,
        period: "Q2-2026",
      },
    });

    const caller = createTestCaller(owner.id);
    const byPeriod = await caller.okr.getAll({
      workspaceId: ws.id,
      period: "Q3-2026",
    });
    expect(byPeriod.map((kr) => kr.id)).toEqual([keyResult.id]);

    const byGoal = await caller.okr.getAll({ workspaceId: ws.id, goalId: goal.id });
    expect(byGoal).toHaveLength(2);

    const byStatus = await caller.okr.getAll({
      workspaceId: ws.id,
      status: "achieved",
    });
    expect(byStatus).toEqual([]);
  });
});

describe("okr key result mutations authorize owner OR workspace member", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("lets a member check in against a colleague's key result", async () => {
    const { member, keyResult } = await seedWorkspaceKeyResult(db);

    await createTestCaller(member.id).okr.checkIn({
      keyResultId: keyResult.id,
      newValue: 100,
      notes: "agent check-in",
    });

    const after = await db.keyResult.findUniqueOrThrow({
      where: { id: keyResult.id },
    });
    expect(after.currentValue).toBe(100);
    expect(after.status).toBe("on-track");
  });

  it("lets a member update a colleague's key result", async () => {
    const { member, keyResult } = await seedWorkspaceKeyResult(db);

    await createTestCaller(member.id).okr.update({
      id: keyResult.id,
      title: "Weekly active teams 40 → 150",
      targetValue: 150,
    });

    const after = await db.keyResult.findUniqueOrThrow({
      where: { id: keyResult.id },
    });
    expect(after.targetValue).toBe(150);
  });

  it("lets a member add a key result to a colleague's objective, inheriting the workspace", async () => {
    const { member, ws, goal } = await seedWorkspaceKeyResult(db);

    const created = await createTestCaller(member.id).okr.create({
      goalId: goal.id,
      title: "NPS 30 → 45",
      targetValue: 45,
      startValue: 30,
      currentValue: 30,
      unit: "count",
      period: "Q3-2026",
    });

    expect(created.workspaceId).toBe(ws.id);
  });

  it("lets a member read a colleague's key result by id", async () => {
    const { member, keyResult } = await seedWorkspaceKeyResult(db);

    const fetched = await createTestCaller(member.id).okr.getById({
      id: keyResult.id,
    });

    expect(fetched.id).toBe(keyResult.id);
  });

  it("lets a member delete a colleague's key result", async () => {
    const { member, keyResult } = await seedWorkspaceKeyResult(db);

    await createTestCaller(member.id).okr.delete({ id: keyResult.id });

    expect(
      await db.keyResult.findUnique({ where: { id: keyResult.id } }),
    ).toBeNull();
  });

  it("still refuses a non-member on every mutation", async () => {
    const { stranger, goal, keyResult } = await seedWorkspaceKeyResult(db);
    const caller = createTestCaller(stranger.id);

    await expect(
      caller.okr.update({ id: keyResult.id, targetValue: 1 }),
    ).rejects.toThrow(/not found/i);
    await expect(
      caller.okr.checkIn({ keyResultId: keyResult.id, newValue: 1 }),
    ).rejects.toThrow(/not found/i);
    await expect(caller.okr.delete({ id: keyResult.id })).rejects.toThrow(
      /not found/i,
    );
    await expect(
      caller.okr.create({
        goalId: goal.id,
        title: "Nope",
        targetValue: 1,
        startValue: 0,
        currentValue: 0,
        unit: "count",
        period: "Q3-2026",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("refuses to move a key result onto an objective the caller cannot access", async () => {
    const { member, keyResult } = await seedWorkspaceKeyResult(db);
    const outsider = await createUser(db);
    const foreignGoal = await createGoal(db, { userId: outsider.id });

    await expect(
      createTestCaller(member.id).okr.update({
        id: keyResult.id,
        goalId: foreignGoal.id,
      }),
    ).rejects.toThrow(/not found/i);
  });
});

/**
 * Membership is not edit rights. `viewer` is read-only and `guest` is
 * synthesized for project-only access, so authorizing a write on
 * `getWorkspaceMembership` alone hands both of them the ability to move a key
 * result's value, retarget it onto another objective, or delete it — things
 * they could previously only read. `canEditWorkspaceContent` is the repo's
 * answer to that, and its docstring says as much.
 */
describe("okr writes require edit rights, not bare membership", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function seedWithViewer() {
    const seeded = await seedWorkspaceKeyResult(db);
    const viewer = await createUser(db);
    await addWorkspaceMember(db, seeded.ws.id, viewer.id, "viewer");
    return { ...seeded, viewer };
  }

  it("refuses a viewer's check-in", async () => {
    const { viewer, keyResult } = await seedWithViewer();

    await expect(
      createTestCaller(viewer.id).okr.checkIn({
        keyResultId: keyResult.id,
        newValue: 999,
      }),
    ).rejects.toThrow(/not found/i);

    const after = await db.keyResult.findUniqueOrThrow({
      where: { id: keyResult.id },
    });
    expect(after.currentValue).toBe(40);
  });

  it("refuses a viewer's update and delete", async () => {
    const { viewer, keyResult } = await seedWithViewer();
    const caller = createTestCaller(viewer.id);

    await expect(
      caller.okr.update({ id: keyResult.id, targetValue: 1 }),
    ).rejects.toThrow(/not found/i);
    await expect(caller.okr.delete({ id: keyResult.id })).rejects.toThrow(
      /not found/i,
    );
    expect(
      await db.keyResult.findUnique({ where: { id: keyResult.id } }),
    ).not.toBeNull();
  });

  it("refuses a viewer creating a key result on the objective", async () => {
    const { viewer, goal } = await seedWithViewer();

    await expect(
      createTestCaller(viewer.id).okr.create({
        goalId: goal.id,
        title: "Nope",
        targetValue: 1,
        startValue: 0,
        currentValue: 0,
        unit: "count",
        period: "Q3-2026",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("but a viewer can still read", async () => {
    const { viewer, ws, keyResult } = await seedWithViewer();

    const list = await createTestCaller(viewer.id).okr.getAll({
      workspaceId: ws.id,
    });

    expect(list.map((kr) => kr.id)).toEqual([keyResult.id]);
  });

  it("still lets an ordinary member write", async () => {
    const { member, keyResult } = await seedWithViewer();

    await createTestCaller(member.id).okr.checkIn({
      keyResultId: keyResult.id,
      newValue: 100,
    });

    const after = await db.keyResult.findUniqueOrThrow({
      where: { id: keyResult.id },
    });
    expect(after.currentValue).toBe(100);
  });
});

describe("a key result belongs to its objective's workspace", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("inherits the objective's workspace rather than a caller-supplied one", async () => {
    const { owner, ws, goal } = await seedWorkspaceKeyResult(db);
    const other = await createWorkspace(db, { ownerId: owner.id });

    await expect(
      createTestCaller(owner.id).okr.create({
        goalId: goal.id,
        title: "Smuggled",
        targetValue: 1,
        startValue: 0,
        currentValue: 0,
        unit: "count",
        period: "Q3-2026",
        workspaceId: other.id,
      }),
    ).rejects.toThrow(/objective's workspace/i);

    expect(await db.keyResult.count({ where: { workspaceId: other.id } })).toBe(0);

    const created = await createTestCaller(owner.id).okr.create({
      goalId: goal.id,
      title: "Inherited",
      targetValue: 1,
      startValue: 0,
      currentValue: 0,
      unit: "count",
      period: "Q3-2026",
    });
    expect(created.workspaceId).toBe(ws.id);
  });
});

// An inline `workspace.members.some` filter sees only direct WorkspaceUser
// rows, so a user whose access comes via a team would 404 on the very key
// result getAll/getByObjective just handed them. linkProject records having
// been bitten by this; getById goes through the resolver for the same reason.
describe("okr.getById honours team-derived workspace access", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("lets a team-derived member read a key result they have no direct membership for", async () => {
    const { ws, keyResult } = await seedWorkspaceKeyResult(db);
    const teamUser = await createUser(db);
    const team = await createTeam(db, { workspaceId: ws.id });
    await db.teamUser.create({ data: { teamId: team.id, userId: teamUser.id } });

    // No WorkspaceUser row — access exists only through the team.
    expect(
      await db.workspaceUser.findFirst({
        where: { userId: teamUser.id, workspaceId: ws.id },
      }),
    ).toBeNull();

    const fetched = await createTestCaller(teamUser.id).okr.getById({
      id: keyResult.id,
    });
    expect(fetched.id).toBe(keyResult.id);
  });

  it("still refuses someone with no access at all", async () => {
    const { stranger, keyResult } = await seedWorkspaceKeyResult(db);

    await expect(
      createTestCaller(stranger.id).okr.getById({ id: keyResult.id }),
    ).rejects.toThrow(/not found/i);
  });
});
