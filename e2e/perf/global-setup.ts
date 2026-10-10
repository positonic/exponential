/**
 * Perf harness global setup: everything the base e2e setup does (seed the
 * dev-fixture workspace, mint a session into e2e/.auth/), plus the bulk
 * perf volume, plus a lookup of one concrete id per dynamic route segment.
 *
 * Entities are picked to be representative-to-heavy (the project with the
 * most actions, the feature with the most tickets), so detail pages are
 * measured against realistic data rather than the emptiest row.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import baseGlobalSetup from "../global-setup";
import { loadDevEnvOrThrow } from "../../scripts/dev-fixture/env";
import type { PerfParams } from "./routes";

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".auth");

export default async function perfGlobalSetup() {
  await baseGlobalSetup();
  loadDevEnvOrThrow();

  const { PrismaClient } = await import("@prisma/client");
  const { FIXTURE } = await import("../../scripts/dev-fixture/seed");
  const { seedPerfVolume } = await import("../../scripts/dev-fixture/seed-perf");

  const db = new PrismaClient();
  try {
    await seedPerfVolume(db);

    const workspace = await db.workspace.findUniqueOrThrow({ where: { slug: FIXTURE.workspaceSlug } });
    const workspaceId = workspace.id;
    const product = await db.product.findUniqueOrThrow({
      where: { workspaceId_slug: { workspaceId, slug: FIXTURE.productSlug } },
    });
    const user = await db.user.findUniqueOrThrow({ where: { email: FIXTURE.userEmail } });

    const busiestProject = await db.action.groupBy({
      by: ["projectId"],
      where: { workspaceId, projectId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { projectId: "desc" } },
      take: 1,
    });
    const project = busiestProject[0]?.projectId
      ? await db.project.findUnique({ where: { id: busiestProject[0].projectId } })
      : null;
    const busiestFeature = await db.ticket.groupBy({
      by: ["featureId"],
      where: { productId: product.id, featureId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { featureId: "desc" } },
      take: 1,
    });
    const featureId = busiestFeature[0]?.featureId ?? undefined;

    const [
      action, goal, contact, organization, collection, form, automation, ticket, scope, cycle,
      epic, insight, research, retro, ceremony, occurrence, decision, adr, page, recording, team, video, whatsapp,
    ] = await Promise.all([
      db.action.findFirst({ where: { workspaceId, projectId: { not: null } }, orderBy: { createdAt: "asc" } }),
      db.goal.findFirst({ where: { workspaceId }, orderBy: { id: "asc" } }),
      db.crmContact.findFirst({ where: { workspaceId, organizationId: { not: null } }, orderBy: { createdAt: "asc" } }),
      db.crmOrganization.findFirst({ where: { workspaceId }, orderBy: { name: "asc" } }),
      db.collection.findFirst({ where: { workspaceId } }),
      db.form.findFirst({ where: { workspaceId } }),
      db.workflowDefinition.findFirst({ where: { workspaceId } }),
      db.ticket.findFirst({ where: { productId: product.id, number: { gt: 0 } }, orderBy: { number: "asc" } }),
      featureId ? db.featureScope.findFirst({ where: { featureId } }) : null,
      db.list.findFirst({ where: { workspaceId, listType: "SPRINT" } }),
      db.epic.findFirst({ where: { workspaceId } }),
      db.insight.findFirst({ where: { productId: product.id } }),
      db.research.findFirst({ where: { productId: product.id } }),
      db.retrospective.findFirst({ where: { workspaceId } }),
      db.ceremony.findFirst({ where: { workspaceId } }),
      db.ceremonyOccurrence.findFirst({ where: { workspaceId } }),
      db.decision.findFirst({ where: { workspaceId } }),
      db.adrDocument.findFirst({}),
      db.knowledgePage.findFirst({ where: { workspaceId } }),
      db.transcriptionSession.findFirst({ where: { workspaceId }, orderBy: { createdAt: "asc" } }),
      db.team.findFirst({ where: { members: { some: { userId: user.id } } } }),
      db.video.findFirst({ where: { slug: { not: null } } }),
      db.whatsAppConfig.findFirst({}),
    ]);

    const params: PerfParams = {
      workspaceSlug: workspace.slug,
      productSlug: product.slug,
      actionId: action?.id,
      slug: project ? `${project.slug}-${project.id}` : undefined,
      goalId: goal ? String(goal.id) : undefined,
      contactId: contact?.id,
      organizationId: organization?.id,
      collectionId: collection?.id,
      formId: form?.id,
      automationId: automation?.id,
      ticketId: ticket ? String(ticket.number) : undefined,
      featureId,
      scopeId: scope?.id,
      cycleId: cycle?.id,
      epicId: epic?.id,
      insightId: insight?.id,
      researchId: research?.id,
      retroId: retro?.id,
      ceremonyId: occurrence?.ceremonyId ?? ceremony?.id,
      occurrenceId: occurrence?.id,
      decisionId: decision?.id,
      adrId: adr?.id,
      pageId: page?.id,
      recordingId: recording?.id,
      date: new Date().toISOString().slice(0, 10),
      teamSlug: team?.slug,
      userId: user.id,
      videoSlug: video?.slug ?? undefined,
      whatsappId: whatsapp?.id,
      path: "index",
      docPath: "getting-started/configuration",
    };

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(path.join(AUTH_DIR, "perf-params.json"), JSON.stringify(params, null, 2));
  } finally {
    await db.$disconnect();
  }
}
