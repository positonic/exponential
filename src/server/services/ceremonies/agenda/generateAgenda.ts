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
import { narrateAgenda, type NarrateOptions } from "./narrateAgenda";
import { withAgendaTransaction } from "./items";
import { dropEmptyAutoSections, withAutoProjectsSection } from "./autoSections";
import { formatOccurrenceLabel } from "../activity";
import { resolveParticipantUserIds } from "../participants";
import { ensureSeededOccurrenceNotesPage } from "../notesSeed";
import { reportHandledErrorServer } from "~/server/utils/reportHandledErrorServer";

export interface GenerateAgendaResult {
  occurrenceId: string;
  agenda: AgendaSnapshot;
  itemCount: number;
}

export async function generateAgenda(
  db: PrismaClient,
  occurrenceId: string,
  opts: { now?: Date; narrate?: boolean; narrateOptions?: NarrateOptions } = {},
): Promise<GenerateAgendaResult> {
  const now = opts.now ?? new Date();
  const occurrence = await db.ceremonyOccurrence.findUnique({
    where: { id: occurrenceId },
    include: {
      ceremony: {
        include: {
          participants: { select: { userId: true } },
          projects: { select: { projectId: true } },
          workspace: { select: { slug: true } },
        },
      },
    },
  });
  if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
  // A skipped occurrence has no meeting to prepare for; regenerating would
  // also stamp `agendaCirculatedAt` and change what an undo restores to.
  if (occurrence.status === "SKIPPED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This occurrence was skipped — undo the skip to work on its agenda" });
  }
  const { ceremony } = occurrence;

  const previousOccurrence = await db.ceremonyOccurrence.findFirst({
    where: { ceremonyId: ceremony.id, scheduledStart: { lt: occurrence.scheduledStart } },
    orderBy: { scheduledStart: "desc" },
  });

  const participantUserIds = await resolveParticipantUserIds(db, ceremony);

  const ctx: SectionContext = {
    db,
    workspaceId: ceremony.workspaceId,
    ceremony,
    occurrence,
    previousOccurrence,
    participantUserIds,
    projectIds: ceremony.projects.map((p) => p.projectId),
    now,
    workspacePath: `/w/${ceremony.workspace.slug}`,
  };

  // The template, plus the linked-projects section the ceremony carries
  // without listing it (`includeProjects`, on by default).
  const template = withAutoProjectsSection(readAgendaTemplate(ceremony.agendaTemplate), ceremony.includeProjects);
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

  // The snapshot we read at the top of this function is stale by now: the
  // section queries above took a while, and someone may have resolved or
  // added an item meanwhile. Re-read and assemble inside the same
  // serializable transaction every other agenda writer uses, so a person's
  // edit is merged rather than reverted.
  const agenda = await withAgendaTransaction(db, async (tx) => {
    const fresh = await tx.ceremonyOccurrence.findUnique({ where: { id: occurrence.id }, select: { agenda: true } });
    const assembled = dropEmptyAutoSections(buildAgenda(template, results, readAgendaSnapshot(fresh?.agenda), now));
    await tx.ceremonyOccurrence.update({
      where: { id: occurrence.id },
      data: { agenda: assembled as unknown as Prisma.InputJsonValue, agendaGeneratedAt: now },
    });
    return assembled;
  });

  // Narration runs AFTER the structured agenda is durable. It is a network
  // call with its own timeout, and this function is called in a loop by the
  // hourly sweep — narrating first would mean a hang or a function kill lost
  // the whole agenda, not just its pre-read.
  if (opts.narrate !== false) {
    try {
      const narrative = await narrateAgenda(
        { ceremonyName: ceremony.name, when: formatOccurrenceLabel("", occurrence.scheduledStart, ceremony.timezone).replace(/^ · /, ""), agenda },
        opts.narrateOptions,
      );
      if (narrative) {
        agenda.narrative = narrative;
        agenda.narratedAt = now.toISOString();
        await withAgendaTransaction(db, async (tx) => {
          const fresh = await tx.ceremonyOccurrence.findUnique({ where: { id: occurrence.id }, select: { agenda: true } });
          const current = readAgendaSnapshot(fresh?.agenda);
          // Only narrate the generation we just wrote. If something has
          // regenerated since, its own narration owns the field.
          if (!current || current.generatedAt !== agenda.generatedAt) return;
          const next: AgendaSnapshot = { ...current, narrative, narratedAt: now.toISOString() };
          await tx.ceremonyOccurrence.update({
            where: { id: occurrence.id },
            data: { agenda: next as unknown as Prisma.InputJsonValue },
          });
        });
      }
    } catch (error) {
      console.error("[ceremonies] narrateAgenda failed; the agenda is stored without a narrative:", error);
    }
  }

  // The notes canvas (a Knowledge Page, ADR-0033) exists from the first
  // generation on, seeded with the section headings and the pre-read — which
  // is why it runs after narration. A page anyone has written in is never
  // touched again. Its failure must not undo the agenda that is already
  // durable above, so it is reported rather than thrown; the next generation
  // retries.
  try {
    await ensureSeededOccurrenceNotesPage(db, occurrence, ceremony, agenda);
  } catch (error) {
    console.error("[ceremonies] ensureSeededOccurrenceNotesPage failed; the agenda is stored without a notes page:", error);
    reportHandledErrorServer(error, {
      area: "ceremonies.ensureSeededOccurrenceNotesPage",
      context: { occurrenceId: occurrence.id },
    });
  }
  return {
    occurrenceId: occurrence.id,
    agenda,
    itemCount: agenda.sections.reduce((n, s) => n + s.items.length, 0),
  };
}
