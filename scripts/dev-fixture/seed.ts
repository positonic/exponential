/**
 * Seed a small, self-contained fixture for visual verification of the product
 * feature views: one workspace, one product, one feature carrying tickets in
 * assorted statuses. Everything hangs off the `dev-fixture` workspace slug so
 * it is obviously disposable and deletable in one cascade.
 *
 * Idempotent: stable slugs/numbers, upserts throughout - safe to re-run.
 *
 * The ticket spread is deliberate, not decorative:
 *   - statuses span BACKLOG → DONE so status badges exercise their palette
 *   - one IN_PROGRESS ticket depends on an open ticket → BlockedIndicator fires
 *   - one ticket is attached to a scope ONLY (scopeId set, featureId null) -
 *     the feature Tickets accordion excludes it by design (it scopes by
 *     featureId, same as feature._count.tickets), so the fixture makes that
 *     design decision observable: 6 tickets exist, the accordion shows 5.
 */
import type { PrismaClient } from "@prisma/client";

export const FIXTURE = {
  userEmail: "dev-fixture@exponential.test",
  userName: "Dev Fixture",
  workspaceSlug: "dev-fixture",
  workspaceName: "Dev Fixture",
  productSlug: "fixture",
  productName: "Fixture Product",
  featureName: "Tickets accordion fixture",
  projectSlug: "goal-hierarchy-fixture",
  projectName: "Goal hierarchy fixture",
  parentGoalTitle: "Grow the fixture business",
  childGoalTitle: "Ship the goal hierarchy affordance",
  offProjectParentGoalTitle: "Company-wide alignment (not on this project)",
  detachedChildGoalTitle: "Sub-goal whose parent is off-project",
} as const;

export interface SeededFixture {
  userId: string;
  workspaceSlug: string;
  productSlug: string;
  featureId: string;
  /** App-relative URL of the seeded feature's detail page. */
  featureUrl: string;
  /** App-relative URL of the features list with the seeded feature peeked. */
  peekUrl: string;
  /** Tickets linked to the feature (visible in the accordion). */
  featureTicketCount: number;
  /** Total tickets seeded, including the scope-only one the accordion hides. */
  totalTicketCount: number;
  /** App-relative URL of the seeded project's Goals tab (the goal hierarchy). */
  projectGoalsUrl: string;
  /** Goals on that project: a parent, its sub-goal, and a detached sub-goal. */
  goalIds: { parent: number; child: number; offProjectParent: number; detachedChild: number };
}

interface TicketSpec {
  number: number;
  title: string;
  status: "BACKLOG" | "IN_PROGRESS" | "BLOCKED" | "QA" | "DONE";
  priority: number | null;
  assign: boolean;
  /** Attach to the scope INSTEAD of the feature (the excluded case). */
  scopeOnly?: boolean;
}

const TICKETS: TicketSpec[] = [
  { number: 1, title: "Render ticket rows in the accordion", status: "DONE", priority: 1, assign: true },
  { number: 2, title: "Wire blocked indicator through ticket.list", status: "IN_PROGRESS", priority: 0, assign: true },
  { number: 3, title: "Empty state copy for ticketless features", status: "BACKLOG", priority: 3, assign: false },
  { number: 4, title: "Peek drawer keyboard navigation", status: "QA", priority: 2, assign: true },
  { number: 5, title: "Ticket row hover affordances", status: "BACKLOG", priority: null, assign: false },
  { number: 6, title: "Scope-only ticket (must NOT appear in the feature accordion)", status: "BACKLOG", priority: null, assign: false, scopeOnly: true },
];

export async function seedDevFixture(db: PrismaClient): Promise<SeededFixture> {
  const user = await db.user.upsert({
    where: { email: FIXTURE.userEmail },
    update: {},
    create: {
      email: FIXTURE.userEmail,
      name: FIXTURE.userName,
      emailVerified: new Date(),
    },
  });

  const workspace = await db.workspace.upsert({
    where: { slug: FIXTURE.workspaceSlug },
    update: {},
    create: {
      slug: FIXTURE.workspaceSlug,
      name: FIXTURE.workspaceName,
      type: "team",
      ownerId: user.id,
    },
  });

  await db.workspaceUser.upsert({
    where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
    update: { role: "owner" },
    create: { userId: user.id, workspaceId: workspace.id, role: "owner" },
  });

  const product = await db.product.upsert({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: FIXTURE.productSlug } },
    update: {},
    create: {
      workspaceId: workspace.id,
      slug: FIXTURE.productSlug,
      name: FIXTURE.productName,
      createdById: user.id,
      // Linear-style IDs (FP-1 ...) rather than fun shortIds: exercises the
      // generateLinearId branch of the accordion's display-ID logic.
      funTicketIds: false,
      ticketCounter: TICKETS.length,
    },
  });

  let feature = await db.feature.findFirst({
    where: { productId: product.id, name: FIXTURE.featureName },
  });
  feature ??= await db.feature.create({
    data: {
      productId: product.id,
      name: FIXTURE.featureName,
      description:
        "Seeded by scripts/seed-dev-fixture.ts for visual verification of the feature Tickets accordion.",
      status: "IN_PROGRESS",
      createdById: user.id,
    },
  });

  let scope = await db.featureScope.findFirst({
    where: { featureId: feature.id, version: "v1.0" },
  });
  scope ??= await db.featureScope.create({
    data: {
      featureId: feature.id,
      version: "v1.0",
      description: "First slice - carries the scope-only ticket.",
      status: "IN_PROGRESS",
    },
  });

  const byNumber = new Map<number, string>();
  for (const spec of TICKETS) {
    const ticket = await db.ticket.upsert({
      where: { productId_number: { productId: product.id, number: spec.number } },
      update: {
        status: spec.status,
        featureId: spec.scopeOnly ? null : feature.id,
        scopeId: spec.scopeOnly ? scope.id : null,
      },
      create: {
        productId: product.id,
        number: spec.number,
        title: spec.title,
        type: "FEATURE",
        status: spec.status,
        priority: spec.priority,
        featureId: spec.scopeOnly ? null : feature.id,
        scopeId: spec.scopeOnly ? scope.id : null,
        createdById: user.id,
        assigneeId: spec.assign ? user.id : null,
      },
    });
    byNumber.set(spec.number, ticket.id);
  }

  // Ticket 2 (IN_PROGRESS) depends on open ticket 3 → derived isBlocked=true,
  // so the accordion's BlockedIndicator renders.
  await db.ticketDependency.upsert({
    where: {
      ticketId_dependsOnId: {
        ticketId: byNumber.get(2)!,
        dependsOnId: byNumber.get(3)!,
      },
    },
    update: {},
    create: {
      ticketId: byNumber.get(2)!,
      dependsOnId: byNumber.get(3)!,
      createdById: user.id,
    },
  });

  // A project carrying a goal hierarchy, so the Goals tab's nesting affordance
  // is observable: a parent with a sub-goal under it, plus a sub-goal whose
  // parent is NOT on this project (it can't be nested under anything on
  // screen, so it stays at the root and names its parent instead).
  const project = await db.project.upsert({
    where: { slug: FIXTURE.projectSlug },
    // Re-assert the workspace on re-seed: the project is reached through a
    // workspace-scoped route, so a project that drifted out of the workspace
    // makes its own Goals tab unreachable.
    update: { workspaceId: workspace.id, status: "ACTIVE" },
    create: {
      slug: FIXTURE.projectSlug,
      name: FIXTURE.projectName,
      description: "Seeded for visual verification of sub-goal nesting on the project Goals tab.",
      status: "ACTIVE",
      priority: "HIGH",
      createdById: user.id,
      workspaceId: workspace.id,
    },
  });

  const upsertGoal = async (
    title: string,
    opts: { description?: string; parentGoalId?: number; onProject: boolean; displayOrder: number },
  ) => {
    const existing = await db.goal.findFirst({ where: { userId: user.id, title } });
    const data = {
      description: opts.description ?? null,
      status: "active",
      parentGoalId: opts.parentGoalId ?? null,
      displayOrder: opts.displayOrder,
      ...(opts.onProject ? { projects: { connect: { id: project.id } } } : {}),
    };
    return existing
      ? await db.goal.update({ where: { id: existing.id }, data })
      : await db.goal.create({
          data: { title, userId: user.id, workspaceId: workspace.id, ...data },
        });
  };

  const parentGoal = await upsertGoal(FIXTURE.parentGoalTitle, {
    description: "Root objective — the sub-goal below nests under it.",
    onProject: true,
    displayOrder: 0,
  });
  const childGoal = await upsertGoal(FIXTURE.childGoalTitle, {
    description: "Nested one level under its parent.",
    parentGoalId: parentGoal.id,
    onProject: true,
    displayOrder: 1,
  });
  const offProjectParentGoal = await upsertGoal(FIXTURE.offProjectParentGoalTitle, {
    onProject: false,
    displayOrder: 2,
  });
  const detachedChildGoal = await upsertGoal(FIXTURE.detachedChildGoalTitle, {
    description: "Its parent isn't on this project, so the row names the parent.",
    parentGoalId: offProjectParentGoal.id,
    onProject: true,
    displayOrder: 3,
  });

  const base = `/w/${FIXTURE.workspaceSlug}/products/${FIXTURE.productSlug}`;
  return {
    projectGoalsUrl: `/w/${FIXTURE.workspaceSlug}/projects/${project.slug}?tab=goals`,
    goalIds: {
      parent: parentGoal.id,
      child: childGoal.id,
      offProjectParent: offProjectParentGoal.id,
      detachedChild: detachedChildGoal.id,
    },
    userId: user.id,
    workspaceSlug: FIXTURE.workspaceSlug,
    productSlug: FIXTURE.productSlug,
    featureId: feature.id,
    featureUrl: `${base}/features/${feature.id}`,
    peekUrl: `${base}/features?peek=${feature.id}`,
    featureTicketCount: TICKETS.filter((t) => !t.scopeOnly).length,
    totalTicketCount: TICKETS.length,
  };
}
