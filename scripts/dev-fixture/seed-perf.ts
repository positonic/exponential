/**
 * Bulk-seed the `dev-fixture` workspace to a realistic size for the page-load
 * performance harness (e2e/perf/). The base fixture (seed.ts) carries a
 * handful of rows per entity, which hides slow queries, N+1s and unpaginated
 * lists; this adds hundreds to thousands so they show up in the numbers.
 *
 * Run after `npm run dev:seed-fixture`:
 *
 *   npx tsx scripts/seed-perf-fixture.ts
 *
 * Idempotent: every row hangs off a `perf-` slug/prefix, and the whole batch
 * is skipped when the sentinel project already exists. Deterministic: a seeded
 * PRNG drives every choice, so two machines seed identical data.
 */
import type { Feature, PipelineStage, PrismaClient } from "@prisma/client";
import { FIXTURE } from "./seed";

export const PERF_VOLUME = {
  members: 8,
  projects: 40,
  actions: 1500,
  goals: 30,
  organizations: 200,
  contacts: 1600,
  deals: 120,
  features: 12,
  tickets: 300,
  meetings: 100,
} as const;

const SENTINEL_PROJECT_SLUG = "perf-project-0";
const DAY = 24 * 60 * 60 * 1000;

const PRIORITIES = [
  "Quick", "Scheduled", "1st Priority", "2nd Priority", "3rd Priority",
  "4th Priority", "5th Priority", "Errand", "Remember", "Watch", "Someday Maybe",
] as const;
const KANBAN = ["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
const TICKET_STATUSES = [
  "BACKLOG", "READY_TO_PLAN", "COMMITTED", "IN_PROGRESS", "BLOCKED", "QA", "DONE",
] as const;
const STAGES = [
  { name: "Lead", color: "gray", type: "active" },
  { name: "Qualified", color: "blue", type: "active" },
  { name: "Proposal", color: "violet", type: "active" },
  { name: "Negotiation", color: "orange", type: "active" },
  { name: "Won", color: "green", type: "won" },
  { name: "Lost", color: "red", type: "lost" },
] as const;
const FIRST = ["Ada", "Grace", "Linus", "Margaret", "Alan", "Barbara", "Ken", "Frances", "Donald", "Radia"];
const LAST = ["Lovelace", "Hopper", "Torvalds", "Hamilton", "Turing", "Liskov", "Thompson", "Allen", "Knuth", "Perlman"];
const WORDS = ["roadmap", "invoice", "onboarding", "migration", "review", "launch", "budget", "hiring", "audit", "sync", "pricing", "renewal"];

/** mulberry32 — tiny deterministic PRNG so the seeded volume is reproducible. */
function prng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedPerfVolume(db: PrismaClient): Promise<{ skipped: boolean }> {
  const existing = await db.project.findUnique({ where: { slug: SENTINEL_PROJECT_SLUG } });
  if (existing) {
    await seedDetailEntities(db);
    return { skipped: true };
  }

  const rand = prng(42);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const now = Date.now();

  const owner = await db.user.findUniqueOrThrow({ where: { email: FIXTURE.userEmail } });
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: FIXTURE.workspaceSlug } });
  const product = await db.product.findUniqueOrThrow({
    where: { workspaceId_slug: { workspaceId: workspace.id, slug: FIXTURE.productSlug } },
  });

  // ---- members ----
  const memberIds: string[] = [owner.id];
  for (let i = 0; i < PERF_VOLUME.members; i++) {
    const email = `perf-member-${i}@exponential.test`;
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, name: `${FIRST[i % FIRST.length]} ${LAST[i % LAST.length]}`, emailVerified: new Date() },
    });
    await db.workspaceUser.upsert({
      where: { userId_workspaceId: { userId: user.id, workspaceId: workspace.id } },
      update: {},
      create: { userId: user.id, workspaceId: workspace.id, role: "member" },
    });
    memberIds.push(user.id);
  }

  // ---- projects ----
  await db.project.createMany({
    data: Array.from({ length: PERF_VOLUME.projects }, (_, i) => ({
      name: `Perf ${pick(WORDS)} project ${i}`,
      slug: `perf-project-${i}`,
      status: i % 8 === 7 ? "COMPLETED" : "ACTIVE",
      priority: pick(["HIGH", "MEDIUM", "LOW", "NONE"]),
      progress: Math.round(rand() * 100),
      createdById: owner.id,
      driId: pick(memberIds),
      workspaceId: workspace.id,
      description: `Seeded for the perf harness. Tracks the ${pick(WORDS)} work.`,
    })),
  });
  const projects = await db.project.findMany({
    where: { slug: { startsWith: "perf-project-" } },
    select: { id: true },
  });

  // ---- actions: spread across today, overdue, upcoming, unscheduled, done ----
  await db.action.createMany({
    data: Array.from({ length: PERF_VOLUME.actions }, (_, i) => {
      const done = rand() < 0.4;
      const dueOffsetDays = Math.floor(rand() * 60) - 30;
      return {
        name: `Perf action ${i}: ${pick(WORDS)} ${pick(WORDS)}`,
        description: rand() < 0.3 ? `Notes on the **${pick(WORDS)}** follow-up.` : null,
        status: done ? "COMPLETED" : "ACTIVE",
        completedAt: done ? new Date(now - Math.floor(rand() * 30) * DAY) : null,
        priority: pick(PRIORITIES),
        kanbanStatus: done ? "DONE" : pick(KANBAN),
        kanbanOrder: i,
        dueDate: rand() < 0.75 ? new Date(now + dueOffsetDays * DAY) : null,
        projectId: rand() < 0.7 ? pick(projects).id : null,
        createdById: rand() < 0.6 ? owner.id : pick(memberIds),
        workspaceId: workspace.id,
      };
    }),
  });

  // ---- goals ----
  await db.goal.createMany({
    data: Array.from({ length: PERF_VOLUME.goals }, (_, i) => ({
      title: `Perf goal ${i}: improve ${pick(WORDS)}`,
      userId: owner.id,
      driUserId: pick(memberIds),
      workspaceId: workspace.id,
      period: "Annual-2026",
      status: "active",
      displayOrder: i,
    })),
  });

  // ---- CRM: organizations, contacts (PII columns are encrypted bytes — left null) ----
  await db.crmOrganization.createMany({
    data: Array.from({ length: PERF_VOLUME.organizations }, (_, i) => ({
      name: `Perf ${pick(LAST)} ${pick(WORDS)} ${i}`,
      workspaceId: workspace.id,
      createdById: owner.id,
    })),
  });
  const orgs = await db.crmOrganization.findMany({
    where: { workspaceId: workspace.id, name: { startsWith: "Perf " } },
    select: { id: true },
  });
  await db.crmContact.createMany({
    data: Array.from({ length: PERF_VOLUME.contacts }, (_, i) => ({
      firstName: pick(FIRST),
      lastName: `${pick(LAST)}-${i}`,
      workspaceId: workspace.id,
      organizationId: rand() < 0.7 ? pick(orgs).id : null,
      createdById: owner.id,
      lastInteractionAt: rand() < 0.6 ? new Date(now - Math.floor(rand() * 180) * DAY) : null,
      connectionScore: Math.floor(rand() * 100),
    })),
  });
  const contacts = await db.crmContact.findMany({
    where: { workspaceId: workspace.id, lastName: { contains: "-" } },
    select: { id: true },
    take: 400,
  });

  // ---- pipeline + deals ----
  const pipeline = await db.project.create({
    data: {
      name: "Perf sales pipeline",
      slug: "perf-pipeline",
      type: "pipeline",
      createdById: owner.id,
      workspaceId: workspace.id,
    },
  });
  const stages: PipelineStage[] = [];
  for (const [order, stage] of STAGES.entries()) {
    stages.push(await db.pipelineStage.create({ data: { ...stage, order, projectId: pipeline.id } }));
  }
  await db.deal.createMany({
    data: Array.from({ length: PERF_VOLUME.deals }, (_, i) => ({
      title: `Perf deal ${i}: ${pick(WORDS)}`,
      projectId: pipeline.id,
      stageId: pick(stages).id,
      stageOrder: i,
      value: Math.round(rand() * 50_000),
      contactId: pick(contacts).id,
      organizationId: pick(orgs).id,
      workspaceId: workspace.id,
      createdById: owner.id,
      assignedToId: pick(memberIds),
    })),
  });

  // ---- product: features + tickets ----
  const features: Feature[] = [];
  for (let i = 0; i < PERF_VOLUME.features; i++) {
    features.push(
      await db.feature.create({
        data: { productId: product.id, name: `Perf feature ${i}: ${pick(WORDS)}`, createdById: owner.id },
      }),
    );
  }
  await db.ticket.createMany({
    data: Array.from({ length: PERF_VOLUME.tickets }, (_, i) => ({
      productId: product.id,
      number: 1000 + i,
      title: `Perf ticket ${i}: ${pick(WORDS)} ${pick(WORDS)}`,
      status: pick(TICKET_STATUSES),
      priority: Math.floor(rand() * 4),
      featureId: rand() < 0.8 ? pick(features).id : null,
      createdById: owner.id,
      assigneeId: rand() < 0.7 ? pick(memberIds) : null,
    })),
  });

  // ---- meetings ----
  await db.transcriptionSession.createMany({
    data: Array.from({ length: PERF_VOLUME.meetings }, (_, i) => ({
      sessionId: `perf-meeting-${i}`,
      title: `Perf ${pick(WORDS)} sync ${i}`,
      meetingDate: new Date(now - Math.floor(rand() * 90) * DAY),
      userId: owner.id,
      workspaceId: workspace.id,
      projectId: rand() < 0.5 ? pick(projects).id : null,
      summary: `Discussed ${pick(WORDS)} and ${pick(WORDS)}.`,
      transcription: `Speaker 1: Let's talk about ${pick(WORDS)}.`.repeat(20),
    })),
  });

  await seedDetailEntities(db);
  return { skipped: false };
}

/**
 * One row for each dynamic detail route the base fixture leaves empty (epic,
 * insight, research, retrospective, scope, CRM list/form/automation), so the
 * harness can measure those pages. Find-or-create, independent of the bulk
 * sentinel, so an already-seeded database picks them up too.
 */
async function seedDetailEntities(db: PrismaClient): Promise<void> {
  const owner = await db.user.findUniqueOrThrow({ where: { email: FIXTURE.userEmail } });
  const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: FIXTURE.workspaceSlug } });
  const workspaceId = workspace.id;
  const product = await db.product.findUniqueOrThrow({
    where: { workspaceId_slug: { workspaceId, slug: FIXTURE.productSlug } },
  });
  // Same pick as the harness's featureId (most tickets), so the scope route resolves.
  const busiestFeature = await db.ticket.groupBy({
    by: ["featureId"],
    where: { productId: product.id, featureId: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { featureId: "desc" } },
    take: 1,
  });
  const feature = busiestFeature[0]?.featureId ? { id: busiestFeature[0].featureId } : null;

  // /home redirects users whose earliest owned workspace is <24h old to
  // /welcome (resolveNewUserRedirect), so a freshly seeded fixture user would
  // measure /welcome twice and never the real /home. Age the account; leave
  // welcomeCompletedAt null so /welcome itself still renders.
  await db.workspace.updateMany({
    where: { ownerId: owner.id, createdAt: { gt: new Date(Date.now() - 2 * DAY) } },
    data: { createdAt: new Date(Date.now() - 30 * DAY) },
  });

  if (!(await db.epic.findFirst({ where: { workspaceId, name: "Perf epic" } }))) {
    const epic = await db.epic.create({ data: { name: "Perf epic", ownerId: owner.id, workspaceId, productId: product.id } });
    await db.ticket.updateMany({ where: { productId: product.id, number: { gte: 1000, lt: 1040 } }, data: { epicId: epic.id } });
  }
  if (!(await db.insight.findFirst({ where: { productId: product.id, title: "Perf insight" } }))) {
    await db.insight.create({ data: { productId: product.id, type: "PAIN_POINT", title: "Perf insight", createdById: owner.id } });
  }
  if (!(await db.research.findFirst({ where: { productId: product.id, title: "Perf research" } }))) {
    await db.research.create({ data: { productId: product.id, title: "Perf research", createdById: owner.id } });
  }
  if (!(await db.retrospective.findFirst({ where: { workspaceId, title: "Perf retrospective" } }))) {
    await db.retrospective.create({ data: { workspaceId, productId: product.id, title: "Perf retrospective", createdById: owner.id } });
  }
  if (feature && !(await db.featureScope.findFirst({ where: { featureId: feature.id } }))) {
    await db.featureScope.create({ data: { featureId: feature.id, version: "V1", description: "Perf scope" } });
  }
  if (!(await db.collection.findFirst({ where: { workspaceId, name: "Perf contact list" } }))) {
    const collection = await db.collection.create({ data: { workspaceId, name: "Perf contact list", memberType: "crm_contact" } });
    const contacts = await db.crmContact.findMany({ where: { workspaceId }, select: { id: true }, take: 150 });
    await db.collectionMember.createMany({
      data: contacts.map((c) => ({ collectionId: collection.id, memberType: "crm_contact", memberId: c.id })),
      skipDuplicates: true,
    });
  }
  if (!(await db.form.findFirst({ where: { workspaceId, slug: "perf-form" } }))) {
    await db.form.create({ data: { workspaceId, name: "Perf form", slug: "perf-form" } });
  }
  if (!(await db.workflowDefinition.findFirst({ where: { workspaceId, name: "Perf automation" } }))) {
    await db.workflowDefinition.create({
      data: {
        workspaceId,
        createdById: owner.id,
        name: "Perf automation",
        config: { targetCustomerType: "lead", isDefault: false },
        triggerType: "crm_contact_type",
        isActive: false,
      },
    });
  }
}
