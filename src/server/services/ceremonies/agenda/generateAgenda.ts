/**
 * Generate (or regenerate) an occurrence's agenda (ADR-0059): run the
 * ceremony's template sections through the registry, assemble the snapshot
 * with `buildAgenda` and persist it. Idempotent and re-runnable; runs inside
 * the calling request (a cron route or a mutation), never fire-and-forget.
 */
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { buildAgenda, type SectionRunResult } from "./buildAgenda";
import { getSectionModule } from "./sections";
import { readAgendaSnapshot, readAgendaTemplate, type AgendaSnapshot, type SectionContext } from "./types";

export interface GenerateAgendaResult {
  occurrenceId: string;
  agenda: AgendaSnapshot;
  itemCount: number;
}

export async function generateAgenda(
  db: PrismaClient,
  occurrenceId: string,
  opts: { now?: Date } = {},
): Promise<GenerateAgendaResult> {
  const now = opts.now ?? new Date();
  const occurrence = await db.ceremonyOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      ceremony: { include: { participants: { select: { userId: true } }, workspace: { select: { slug: true } } } },
    },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
  const { ceremony } = occurrence;

  const previousOccurrence = await db.ceremonyOccurrence.findFirst({
    where: { ceremonyId: ceremony.id, scheduledStart: { lt: occurrence.scheduledStart } },
    orderBy: { scheduledStart: "desc" },
  });

  const participantUserIds = new Set(ceremony.participants.map((p) => p.userId));
  if (ceremony.teamId) {
    const members = await db.teamUser.findMany({ where: { teamId: ceremony.teamId }, select: { userId: true } });
    for (const m of members) participantUserIds.add(m.userId);
  }

  const ctx: SectionContext = {
    db,
    workspaceId: ceremony.workspaceId,
    ceremony,
    occurrence,
    previousOccurrence,
    participantUserIds: Array.from(participantUserIds),
    now,
    workspacePath: `/w/${ceremony.workspace.slug}`,
  };

  const template = readAgendaTemplate(ceremony.agendaTemplate);
  const results: SectionRunResult[] = [];
  for (const section of template) {
    const mod = getSectionModule(section.type);
    if (!mod) {
      results.push({ section, items: [], emptyReason: `No query for "${section.type}" yet` });
      continue;
    }
    const items = await mod.run(ctx, section);
    results.push({ section, items, emptyReason: items.length === 0 ? "Nothing to raise" : null });
  }

  const agenda = buildAgenda(template, results, readAgendaSnapshot(occurrence.agenda), now);
  await db.ceremonyOccurrence.update({
    where: { id: occurrence.id },
    data: { agenda: agenda as unknown as Prisma.InputJsonValue, agendaGeneratedAt: now },
  });
  return {
    occurrenceId: occurrence.id,
    agenda,
    itemCount: agenda.sections.reduce((n, s) => n + s.items.length, 0),
  };
}
