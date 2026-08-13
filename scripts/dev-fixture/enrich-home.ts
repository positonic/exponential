/**
 * Enrich the dev-fixture workspace so the Activity home page's daily tiers all
 * have something to render: an active cycle with the fixture user's tickets,
 * a QA ticket "waiting on you", overdue/today actions, unread mention
 * notifications, a DRI key result with no check-ins (stale-check-in nudge),
 * recent knowledge pages, and other-user activity events for the
 * "since yesterday" digest.
 *
 * Idempotent like seed.ts: stable slugs/dedupe keys, upsert-or-find
 * throughout. Run after `npm run dev:seed-fixture`:
 *
 *   npx tsx scripts/dev-fixture/enrich-home.ts
 */
import { PrismaClient } from "@prisma/client";
import { loadDevEnvOrThrow } from "./env";
import { FIXTURE } from "./seed";

loadDevEnvOrThrow();

const db = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const user = await db.user.findUniqueOrThrow({
    where: { email: FIXTURE.userEmail },
  });
  const workspace = await db.workspace.findUniqueOrThrow({
    where: { slug: FIXTURE.workspaceSlug },
  });
  const product = await db.product.findUniqueOrThrow({
    where: {
      workspaceId_slug: { workspaceId: workspace.id, slug: FIXTURE.productSlug },
    },
  });

  // The daily tiers live on the Activity layout.
  await db.workspace.update({
    where: { id: workspace.id },
    data: { homeLayout: "activity" },
  });

  // ---- current cycle with the fixture user's tickets ----
  const now = new Date();
  const cycle = await db.list.upsert({
    where: {
      workspaceId_slug: { workspaceId: workspace.id, slug: "fixture-cycle-12" },
    },
    update: {
      status: "ACTIVE",
      startDate: new Date(now.getTime() - 5 * DAY),
      endDate: new Date(now.getTime() + 9 * DAY),
    },
    create: {
      workspaceId: workspace.id,
      slug: "fixture-cycle-12",
      name: "Cycle 12",
      listType: "SPRINT",
      status: "ACTIVE",
      startDate: new Date(now.getTime() - 5 * DAY),
      endDate: new Date(now.getTime() + 9 * DAY),
      cycleGoal: "Ship the tiered daily home and make it feel effortless.",
      createdById: user.id,
    },
  });

  const tickets = await db.ticket.findMany({
    where: { productId: product.id },
    orderBy: { number: "asc" },
  });
  const statusPlan = ["IN_PROGRESS", "COMMITTED", "DONE"] as const;
  for (let i = 0; i < Math.min(3, tickets.length); i++) {
    await db.ticket.update({
      where: { id: tickets[i]!.id },
      data: {
        cycleId: cycle.id,
        assigneeId: user.id,
        status: statusPlan[i],
      },
    });
  }
  // A QA ticket outside the cycle, assigned to the user — "waiting on you".
  if (tickets[3]) {
    await db.ticket.update({
      where: { id: tickets[3].id },
      data: { status: "QA", assigneeId: user.id, cycleId: null },
    });
  }

  // ---- actions: one overdue, one due today ----
  for (const [name, offsetDays] of [
    ["Chase the overdue fixture invoice", -2],
    ["Review today's fixture standup notes", 0],
  ] as const) {
    const existing = await db.action.findFirst({
      where: { name, workspaceId: workspace.id },
    });
    const dueDate = new Date(now.getTime() + offsetDays * DAY);
    if (existing) {
      await db.action.update({
        where: { id: existing.id },
        data: { dueDate, status: "ACTIVE" },
      });
    } else {
      await db.action.create({
        data: {
          name,
          dueDate,
          status: "ACTIVE",
          createdById: user.id,
          workspaceId: workspace.id,
        },
      });
    }
  }

  // ---- unread mention notifications ----
  for (const [key, title, message] of [
    [
      "fixture-mention-1",
      "Ada mentioned you on Fixture objective",
      "@Dev can you sanity-check the Q3 target?",
    ],
    [
      "fixture-mention-2",
      "Grace mentioned you on ticket FIX-2",
      "@Dev the accordion fix looks ready for QA",
    ],
  ] as const) {
    await db.notification.upsert({
      where: { dedupeKey_userId: { dedupeKey: key, userId: user.id } },
      update: { readAt: null },
      create: {
        userId: user.id,
        category: "mention",
        title,
        message,
        dedupeKey: key,
        deeplink: `/w/${FIXTURE.workspaceSlug}/goals`,
      },
    });
  }

  // ---- DRI key result with no check-ins (stale nudge) + at-risk health ----
  const kr = await db.keyResult.findFirst({
    where: { title: FIXTURE.keyResultTitle, workspaceId: workspace.id },
  });
  if (kr) {
    await db.keyResult.update({
      where: { id: kr.id },
      data: { driUserId: user.id, status: "at-risk" },
    });
    const goal = await db.goal.findUnique({ where: { id: kr.goalId } });
    if (goal) {
      await db.goal.update({
        where: { id: goal.id },
        data: { driUserId: user.id, status: "active" },
      });
    }
  }

  // ---- recent pages ----
  for (const title of ["Cycle 12 retro notes", "Home page design scratchpad"]) {
    const existing = await db.knowledgePage.findFirst({
      where: { title, workspaceId: workspace.id },
    });
    if (!existing) {
      await db.knowledgePage.create({
        data: {
          title,
          workspaceId: workspace.id,
          createdById: user.id,
        },
      });
    }
  }

  // ---- other-user activity since yesterday ----
  const bot = await db.user.upsert({
    where: { email: "dev-fixture-bot@exponential.test" },
    update: {},
    create: {
      email: "dev-fixture-bot@exponential.test",
      name: "Fixture Bot",
      emailVerified: new Date(),
    },
  });
  const recent = await db.workspaceActivityEvent.count({
    where: {
      workspaceId: workspace.id,
      userId: bot.id,
      createdAt: { gte: new Date(now.getTime() - DAY) },
    },
  });
  if (recent === 0) {
    await db.workspaceActivityEvent.createMany({
      data: [
        ...tickets.slice(0, 3).map((t) => ({
          workspaceId: workspace.id,
          userId: bot.id,
          entityType: "ticket",
          entityId: t.id,
          action: "status_changed",
        })),
        {
          workspaceId: workspace.id,
          userId: bot.id,
          entityType: "goal",
          entityId: "fixture-goal",
          action: "created",
        },
      ],
    });
  }

  console.log(
    `[enrich-home] dev-fixture home enriched: cycle ${cycle.name}, ` +
      `${Math.min(3, tickets.length)} cycle tickets, mentions, actions, pages, activity.`,
  );
  console.log(
    `[enrich-home] open http://localhost:PORT/w/${FIXTURE.workspaceSlug}/home`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
