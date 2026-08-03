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
  objectiveTitle: "Fixture objective for OKR execution links",
  keyResultTitle: "Linked work renders under the KR accordion",
  okrPeriod: "Annual-2026",
  projectName: "Fixture Linked Project",
  projectSlug: "fixture-linked-project",
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
  /** App-relative URL of the OKR dashboard holding the seeded objective. */
  okrUrl: string;
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

  // OKR execution links (ADR-0050): one objective → one KR carrying BOTH a
  // linked Project and a linked Feature, so the KR accordion on the OKRs tab
  // renders one row of each kind (Project pill / Feature pill).
  const project = await db.project.upsert({
    where: { slug: FIXTURE.projectSlug },
    update: {},
    create: {
      name: FIXTURE.projectName,
      slug: FIXTURE.projectSlug,
      status: "ACTIVE",
      createdById: user.id,
      workspaceId: workspace.id,
    },
  });

  let objective = await db.goal.findFirst({
    where: { workspaceId: workspace.id, title: FIXTURE.objectiveTitle },
  });
  objective ??= await db.goal.create({
    data: {
      title: FIXTURE.objectiveTitle,
      period: FIXTURE.okrPeriod,
      userId: user.id,
      driUserId: user.id,
      workspaceId: workspace.id,
    },
  });

  let keyResult = await db.keyResult.findFirst({
    where: { goalId: objective.id, title: FIXTURE.keyResultTitle },
  });
  keyResult ??= await db.keyResult.create({
    data: {
      title: FIXTURE.keyResultTitle,
      targetValue: 100,
      currentValue: 40,
      startValue: 0,
      unit: "percent",
      period: FIXTURE.okrPeriod,
      goalId: objective.id,
      userId: user.id,
      driUserId: user.id,
      workspaceId: workspace.id,
    },
  });

  await db.keyResultProject.upsert({
    where: {
      keyResultId_projectId: { keyResultId: keyResult.id, projectId: project.id },
    },
    update: {},
    create: { keyResultId: keyResult.id, projectId: project.id },
  });

  await db.keyResultFeature.upsert({
    where: {
      keyResultId_featureId: { keyResultId: keyResult.id, featureId: feature.id },
    },
    update: {},
    create: { keyResultId: keyResult.id, featureId: feature.id },
  });

  const base = `/w/${FIXTURE.workspaceSlug}/products/${FIXTURE.productSlug}`;
  return {
    userId: user.id,
    workspaceSlug: FIXTURE.workspaceSlug,
    productSlug: FIXTURE.productSlug,
    featureId: feature.id,
    featureUrl: `${base}/features/${feature.id}`,
    peekUrl: `${base}/features?peek=${feature.id}`,
    featureTicketCount: TICKETS.filter((t) => !t.scopeOnly).length,
    totalTicketCount: TICKETS.length,
    okrUrl: `/w/${FIXTURE.workspaceSlug}/goals?tab=okrs&year=${FIXTURE.okrPeriod.split("-")[1]}&period=Annual`,
  };
}
