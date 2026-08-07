import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "~/test/test-db";
import { createTestCaller } from "~/test/trpc-helpers";
import {
  createUser,
  createWorkspace,
  addWorkspaceMember,
  createGoal,
  createProject,
} from "~/test/factories";

/**
 * Regression suite for the destructive `goal.updateGoal` overwrite.
 *
 * The incident: an agent archived a workspace goal with `{id, title, status}`.
 * Because every field was coerced with `?? null`, the same call wiped `period`
 * and `workspaceId` — orphaning the goal out of its workspace, which then made
 * the access check fall through to owner-only and locked the agent out of its
 * own change. The rule these tests pin down: an omitted key is never written,
 * and only an explicit `null` clears a column.
 */
describe("goal.updateGoal — partial update semantics", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  async function seedGoal() {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const lifeDomain = await db.lifeDomain.create({
      data: { title: `Domain ${Math.random()}` },
    });
    const project = await createProject(db, {
      createdById: user.id,
      workspaceId: ws.id,
    });
    const goal = await db.goal.create({
      data: {
        title: "Ship OKR support",
        userId: user.id,
        workspaceId: ws.id,
        period: "Q3-2026",
        status: "active",
        lifeDomainId: lifeDomain.id,
        description: "original description",
        projects: { connect: [{ id: project.id }] },
      },
    });
    return { user, ws, lifeDomain, project, goal, caller: createTestCaller(user.id) };
  }

  it("a {id, title, status} update leaves period, workspace, life domain and project links intact", async () => {
    const { caller, goal, ws, lifeDomain, project } = await seedGoal();

    await caller.goal.updateGoal({
      id: goal.id,
      title: "Ship OKR support (archived)",
      status: "archived",
    });

    const after = await db.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: { projects: true },
    });
    expect(after.title).toBe("Ship OKR support (archived)");
    expect(after.status).toBe("archived");
    expect(after.period).toBe("Q3-2026");
    expect(after.workspaceId).toBe(ws.id);
    expect(after.lifeDomainId).toBe(lifeDomain.id);
    expect(after.description).toBe("original description");
    expect(after.projects.map((p) => p.id)).toEqual([project.id]);
  });

  it("an id-only update writes nothing at all", async () => {
    const { caller, goal, ws, project } = await seedGoal();

    await caller.goal.updateGoal({ id: goal.id });

    const after = await db.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: { projects: true },
    });
    expect(after.title).toBe("Ship OKR support");
    expect(after.period).toBe("Q3-2026");
    expect(after.workspaceId).toBe(ws.id);
    expect(after.projects.map((p) => p.id)).toEqual([project.id]);
  });

  it("an explicit null clears the field", async () => {
    const { caller, goal } = await seedGoal();

    await caller.goal.updateGoal({
      id: goal.id,
      period: null,
      description: null,
      lifeDomainId: null,
    });

    const after = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(after.period).toBeNull();
    expect(after.description).toBeNull();
    expect(after.lifeDomainId).toBeNull();
  });

  it("clears project links only when projectId is explicitly null", async () => {
    const { caller, goal } = await seedGoal();

    await caller.goal.updateGoal({ id: goal.id, projectId: null });

    const after = await db.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: { projects: true },
    });
    expect(after.projects).toEqual([]);
  });

  it("replaces project links when projectId names a different project", async () => {
    const { caller, goal, user, ws } = await seedGoal();
    const other = await createProject(db, {
      createdById: user.id,
      workspaceId: ws.id,
    });

    await caller.goal.updateGoal({ id: goal.id, projectId: other.id });

    const after = await db.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: { projects: true },
    });
    expect(after.projects.map((p) => p.id)).toEqual([other.id]);
  });

  it("replaces project links wholesale from projectIds", async () => {
    const { caller, goal, user, ws, project } = await seedGoal();
    const second = await createProject(db, {
      createdById: user.id,
      workspaceId: ws.id,
    });

    await caller.goal.updateGoal({
      id: goal.id,
      projectIds: [project.id, second.id],
    });

    const after = await db.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: { projects: true },
    });
    expect(after.projects.map((p) => p.id).sort()).toEqual(
      [project.id, second.id].sort(),
    );
  });

  it("lets a workspace member who does not own the goal update it without orphaning it", async () => {
    const { goal, ws, project } = await seedGoal();
    const member = await createUser(db);
    await addWorkspaceMember(db, ws.id, member.id);

    await createTestCaller(member.id).goal.updateGoal({
      id: goal.id,
      title: "Renamed by a teammate",
    });

    const after = await db.goal.findUniqueOrThrow({
      where: { id: goal.id },
      include: { projects: true },
    });
    expect(after.title).toBe("Renamed by a teammate");
    expect(after.workspaceId).toBe(ws.id);
    expect(after.projects.map((p) => p.id)).toEqual([project.id]);
  });
});

describe("goal workspace placement is an access change", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  // A goal's workspace decides who can see and edit it. Letting anyone who can
  // edit a goal set an arbitrary workspaceId means they can push it somewhere
  // they cannot see — orphaning it exactly like the overwrite bug — or somewhere
  // they can, exposing it to that workspace's members.
  it("refuses to move a goal into a workspace the caller is not in", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const goal = await createGoal(db, { userId: user.id, workspaceId: ws.id });
    const outsider = await createUser(db);
    const foreignWs = await createWorkspace(db, { ownerId: outsider.id });

    await expect(
      createTestCaller(user.id).goal.updateGoal({
        id: goal.id,
        workspaceId: foreignWs.id,
      }),
    ).rejects.toThrow(/not a member/i);

    const after = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(after.workspaceId).toBe(ws.id);
  });

  it("allows a move into a workspace the caller belongs to", async () => {
    const user = await createUser(db);
    const from = await createWorkspace(db, { ownerId: user.id });
    const to = await createWorkspace(db, { ownerId: user.id });
    const goal = await createGoal(db, { userId: user.id, workspaceId: from.id });

    await createTestCaller(user.id).goal.updateGoal({
      id: goal.id,
      workspaceId: to.id,
    });

    const after = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(after.workspaceId).toBe(to.id);
  });

  it("still allows clearing the workspace, which needs no membership", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const goal = await createGoal(db, { userId: user.id, workspaceId: ws.id });

    await createTestCaller(user.id).goal.updateGoal({
      id: goal.id,
      workspaceId: null,
    });

    const after = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(after.workspaceId).toBeNull();
  });

  it("re-sending the goal's own workspace is not treated as a move", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const goal = await createGoal(db, { userId: user.id, workspaceId: ws.id });
    const member = await createUser(db);
    await addWorkspaceMember(db, ws.id, member.id);

    await createTestCaller(member.id).goal.updateGoal({
      id: goal.id,
      title: "Renamed",
      workspaceId: ws.id,
    });

    const after = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(after.title).toBe("Renamed");
    expect(after.workspaceId).toBe(ws.id);
  });

  it("refuses to create a goal in a workspace the caller is not in", async () => {
    const user = await createUser(db);
    const outsider = await createUser(db);
    const foreignWs = await createWorkspace(db, { ownerId: outsider.id });

    await expect(
      createTestCaller(user.id).goal.createGoal({
        title: "Smuggled",
        workspaceId: foreignWs.id,
      }),
    ).rejects.toThrow(/not a member/i);

    expect(await db.goal.count({ where: { workspaceId: foreignWs.id } })).toBe(0);
  });
});

describe("goal.updateGoalStatus", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("writes only the status column", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const goal = await createGoal(db, {
      userId: user.id,
      workspaceId: ws.id,
      period: "Q3-2026",
      status: "active",
    });

    await createTestCaller(user.id).goal.updateGoalStatus({
      id: goal.id,
      status: "completed",
    });

    const after = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(after.status).toBe("completed");
    expect(after.period).toBe("Q3-2026");
    expect(after.workspaceId).toBe(ws.id);
  });

  it("accepts on-hold, which updateGoal's enum does not", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id });

    await createTestCaller(user.id).goal.updateGoalStatus({
      id: goal.id,
      status: "on-hold",
    });

    const after = await db.goal.findUniqueOrThrow({ where: { id: goal.id } });
    expect(after.status).toBe("on-hold");
  });
});

describe("goal.setParent", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("re-parents without touching any other field", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const project = await createProject(db, {
      createdById: user.id,
      workspaceId: ws.id,
    });
    const annual = await createGoal(db, {
      userId: user.id,
      workspaceId: ws.id,
      title: "Annual",
      period: "Annual-2026",
    });
    const quarterly = await db.goal.create({
      data: {
        title: "Q3",
        userId: user.id,
        workspaceId: ws.id,
        period: "Q3-2026",
        projects: { connect: [{ id: project.id }] },
      },
    });

    await createTestCaller(user.id).goal.setParent({
      id: quarterly.id,
      parentGoalId: annual.id,
    });

    const after = await db.goal.findUniqueOrThrow({
      where: { id: quarterly.id },
      include: { projects: true },
    });
    expect(after.parentGoalId).toBe(annual.id);
    expect(after.period).toBe("Q3-2026");
    expect(after.workspaceId).toBe(ws.id);
    expect(after.projects.map((p) => p.id)).toEqual([project.id]);
  });

  it("detaches when parentGoalId is null", async () => {
    const user = await createUser(db);
    const parent = await createGoal(db, { userId: user.id, title: "Parent" });
    const child = await createGoal(db, {
      userId: user.id,
      title: "Child",
      parentGoalId: parent.id,
    });

    await createTestCaller(user.id).goal.setParent({
      id: child.id,
      parentGoalId: null,
    });

    const after = await db.goal.findUniqueOrThrow({ where: { id: child.id } });
    expect(after.parentGoalId).toBeNull();
  });

  it("rejects a goal being its own parent", async () => {
    const user = await createUser(db);
    const goal = await createGoal(db, { userId: user.id });

    await expect(
      createTestCaller(user.id).goal.setParent({
        id: goal.id,
        parentGoalId: goal.id,
      }),
    ).rejects.toThrow(/own parent/i);
  });

  it("rejects a cycle", async () => {
    const user = await createUser(db);
    const parent = await createGoal(db, { userId: user.id, title: "Parent" });
    const child = await createGoal(db, {
      userId: user.id,
      title: "Child",
      parentGoalId: parent.id,
    });

    await expect(
      createTestCaller(user.id).goal.setParent({
        id: parent.id,
        parentGoalId: child.id,
      }),
    ).rejects.toThrow(/cycle/i);
  });
});

describe("goal.getAllMyGoals filters", () => {
  let db: ReturnType<typeof getTestDb>;

  beforeEach(() => {
    db = getTestDb();
  });

  it("filters a workspace list by period and status", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    await createGoal(db, {
      userId: user.id,
      workspaceId: ws.id,
      title: "Current",
      period: "Q3-2026",
      status: "active",
    });
    await createGoal(db, {
      userId: user.id,
      workspaceId: ws.id,
      title: "Last quarter",
      period: "Q2-2026",
      status: "completed",
    });

    const caller = createTestCaller(user.id);
    const byPeriod = await caller.goal.getAllMyGoals({
      workspaceId: ws.id,
      period: "Q3-2026",
    });
    expect(byPeriod.map((g) => g.title)).toEqual(["Current"]);

    const byStatus = await caller.goal.getAllMyGoals({
      workspaceId: ws.id,
      status: "completed",
    });
    expect(byStatus.map((g) => g.title)).toEqual(["Last quarter"]);
  });

  // A goal list with no progress number can't answer "which goal is starving",
  // which is the whole point of reading goals outside the app.
  it("resolves progress from the goal's key results", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const goal = await createGoal(db, { userId: user.id, workspaceId: ws.id });
    await db.keyResult.create({
      data: {
        goalId: goal.id,
        userId: user.id,
        workspaceId: ws.id,
        title: "Half done",
        startValue: 0,
        currentValue: 50,
        targetValue: 100,
        period: "Q3-2026",
      },
    });

    const [found] = await createTestCaller(user.id).goal.getAllMyGoals({
      workspaceId: ws.id,
    });

    expect(found!.resolvedProgress).toBe(50);
    expect(found!.isProgressManual).toBe(false);
    expect(found!.keyResults).toHaveLength(1);
  });

  it("a manual override wins over the key-result mean", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const goal = await createGoal(db, { userId: user.id, workspaceId: ws.id });
    await db.keyResult.create({
      data: {
        goalId: goal.id,
        userId: user.id,
        workspaceId: ws.id,
        title: "Half done",
        startValue: 0,
        currentValue: 50,
        targetValue: 100,
        period: "Q3-2026",
      },
    });
    await db.goal.update({
      where: { id: goal.id },
      data: { progressOverride: 90 },
    });

    const [found] = await createTestCaller(user.id).goal.getAllMyGoals({
      workspaceId: ws.id,
    });

    expect(found!.resolvedProgress).toBe(90);
    expect(found!.isProgressManual).toBe(true);
  });

  it("reports null progress for a goal with no key results and no override", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    await createGoal(db, { userId: user.id, workspaceId: ws.id });

    const [found] = await createTestCaller(user.id).goal.getAllMyGoals({
      workspaceId: ws.id,
    });

    expect(found!.resolvedProgress).toBeNull();
  });

  it("includes the workspace so a cross-workspace list can label each row", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id, slug: "labelled-ws" });
    await createGoal(db, { userId: user.id, workspaceId: ws.id });

    const [found] = await createTestCaller(user.id).goal.getAllMyGoals({
      workspaceId: ws.id,
    });

    expect(found!.workspace).toMatchObject({ id: ws.id, slug: "labelled-ws" });
  });

  it("includes each goal's projects — the join that maps actions to goals", async () => {
    const user = await createUser(db);
    const ws = await createWorkspace(db, { ownerId: user.id });
    const project = await createProject(db, {
      createdById: user.id,
      workspaceId: ws.id,
    });
    await db.goal.create({
      data: {
        title: "Joined",
        userId: user.id,
        workspaceId: ws.id,
        projects: { connect: [{ id: project.id }] },
      },
    });

    const [found] = await createTestCaller(user.id).goal.getAllMyGoals({
      workspaceId: ws.id,
    });

    expect(found!.projects.map((p) => ({ id: p.id, slug: p.slug }))).toEqual([
      { id: project.id, slug: project.slug },
    ]);
  });
});
