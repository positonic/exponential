import { Factory } from "fishery";
import { randomUUID } from "crypto";
import type { PrismaClient } from "@prisma/client";

// Use randomUUID to avoid collisions when test files run in parallel
const uid = () => randomUUID().slice(0, 8);

// ── User Factory ─────────────────────────────────────────────────────

interface UserAttrs {
  name: string;
  email: string;
}

export const userFactory = Factory.define<UserAttrs>(({ sequence }) => ({
  name: `Test User ${sequence}`,
  email: `testuser-${uid()}-${sequence}@example.com`,
}));

export async function createUser(db: PrismaClient, overrides: Partial<UserAttrs> = {}) {
  const attrs = userFactory.build(overrides);
  return db.user.create({ data: attrs });
}

// ── Workspace Factory ────────────────────────────────────────────────

interface WorkspaceAttrs {
  name: string;
  slug: string;
  type: string;
  ownerId: string;
}

export const workspaceFactory = Factory.define<WorkspaceAttrs>(({ sequence }) => ({
  name: `Test Workspace ${sequence}`,
  slug: `test-ws-${uid()}-${sequence}`,
  type: "team",
  ownerId: "", // must be overridden
}));

export async function createWorkspace(
  db: PrismaClient,
  overrides: Partial<WorkspaceAttrs> & { ownerId: string },
) {
  const attrs = workspaceFactory.build(overrides);
  return db.workspace.create({
    data: {
      ...attrs,
      members: {
        create: { userId: attrs.ownerId, role: "owner" },
      },
    },
    include: { members: true },
  });
}

// ── Workspace Member ─────────────────────────────────────────────────

export async function addWorkspaceMember(
  db: PrismaClient,
  workspaceId: string,
  userId: string,
  role: string = "member",
) {
  return db.workspaceUser.create({
    data: { userId, workspaceId, role },
  });
}

// ── Project Factory ──────────────────────────────────────────────────

interface ProjectAttrs {
  name: string;
  slug: string;
  createdById: string;
  workspaceId?: string;
  teamId?: string;
  isPublic?: boolean;
}

export const projectFactory = Factory.define<ProjectAttrs>(({ sequence }) => ({
  name: `Test Project ${sequence}`,
  slug: `test-proj-${uid()}-${sequence}`,
  createdById: "", // must be overridden
}));

export async function createProject(
  db: PrismaClient,
  overrides: Partial<ProjectAttrs> & { createdById: string },
) {
  const attrs = projectFactory.build(overrides);
  return db.project.create({ data: attrs });
}

// ── Action Factory ───────────────────────────────────────────────────

interface ActionAttrs {
  name: string;
  createdById: string;
  projectId?: string;
  workspaceId?: string;
  status?: string;
  kanbanStatus?: string;
  kanbanOrder?: number;
}

export const actionFactory = Factory.define<ActionAttrs>(({ sequence }) => ({
  name: `Test Action ${sequence}`,
  createdById: "", // must be overridden
  status: "ACTIVE",
}));

export async function createAction(
  db: PrismaClient,
  overrides: Partial<ActionAttrs> & { createdById: string },
) {
  const attrs = actionFactory.build(overrides);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return db.action.create({ data: attrs as any });
}

// ── Action Assignee ──────────────────────────────────────────────────

export async function assignAction(
  db: PrismaClient,
  actionId: string,
  userId: string,
) {
  return db.actionAssignee.create({
    data: { actionId, userId },
  });
}

// ── Goal Factory ─────────────────────────────────────────────────────

interface GoalAttrs {
  title: string;
  userId: string;
  workspaceId?: string;
}

export const goalFactory = Factory.define<GoalAttrs>(({ sequence }) => ({
  title: `Test Goal ${sequence}`,
  userId: "", // must be overridden
}));

export async function createGoal(
  db: PrismaClient,
  overrides: Partial<GoalAttrs> & { userId: string },
) {
  const attrs = goalFactory.build(overrides);
  return db.goal.create({ data: attrs });
}

// ── Outcome Factory ──────────────────────────────────────────────────

interface OutcomeAttrs {
  description: string;
  userId: string;
  workspaceId?: string;
  type?: string;
  dueDate?: Date;
}

export const outcomeFactory = Factory.define<OutcomeAttrs>(({ sequence }) => ({
  description: `Test Outcome ${sequence}`,
  userId: "", // must be overridden
  type: "daily",
}));

export async function createOutcome(
  db: PrismaClient,
  overrides: Partial<OutcomeAttrs> & { userId: string },
) {
  const attrs = outcomeFactory.build(overrides);
  return db.outcome.create({ data: attrs });
}

// ── Team Factory ─────────────────────────────────────────────────────

interface TeamAttrs {
  name: string;
  slug: string;
  workspaceId?: string;
}

export const teamFactory = Factory.define<TeamAttrs>(({ sequence }) => ({
  name: `Test Team ${sequence}`,
  slug: `test-team-${uid()}-${sequence}`,
}));

export async function createTeam(
  db: PrismaClient,
  overrides: Partial<TeamAttrs> = {},
) {
  const attrs = teamFactory.build(overrides);
  return db.team.create({ data: attrs });
}

export async function addTeamMember(
  db: PrismaClient,
  teamId: string,
  userId: string,
  role: string = "member",
) {
  return db.teamUser.create({
    data: { teamId, userId, role },
  });
}
