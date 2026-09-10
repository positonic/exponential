/**
 * Per-item state on an agenda snapshot (ADR-0059): mark resolved / unresolved,
 * the CAPTURED transition when a linked recording is summarised, and the
 * carry-over of unresolved items into the next occurrence.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { readAgendaSnapshot, type AgendaItem, type AgendaSnapshot } from "./types";

export async function setAgendaItemResolved(
  db: PrismaClient,
  occurrenceId: string,
  itemId: string,
  resolved: boolean,
  now = new Date(),
): Promise<AgendaSnapshot> {
  const occurrence = await db.ceremonyOccurrence.findUnique({ where: { id: occurrenceId }, select: { agenda: true } });
  const agenda = occurrence ? readAgendaSnapshot(occurrence.agenda) : null;
  if (!agenda) throw new TRPCError({ code: "NOT_FOUND", message: "This occurrence has no agenda yet" });
  let found = false;
  const next: AgendaSnapshot = {
    ...agenda,
    sections: agenda.sections.map((s) => ({
      ...s,
      items: s.items.map((i) => {
        if (i.id !== itemId) return i;
        found = true;
        return { ...i, resolvedAt: resolved ? now.toISOString() : null };
      }),
    })),
  };
  if (!found) throw new TRPCError({ code: "NOT_FOUND", message: "Agenda item not found" });
  await db.ceremonyOccurrence.update({
    where: { id: occurrenceId },
    data: { agenda: next as unknown as Prisma.InputJsonValue },
  });
  return next;
}

/**
 * Unresolved items of `fromOccurrenceId`, seeded into the next occurrence of
 * the same ceremony when that one already has an agenda (otherwise the
 * `carried_over` section picks them up at generation time). Returns how many
 * were seeded.
 */
export async function carryOverToNext(db: PrismaClient, fromOccurrenceId: string): Promise<number> {
  const from = await db.ceremonyOccurrence.findUnique({
    where: { id: fromOccurrenceId },
    select: { id: true, ceremonyId: true, scheduledStart: true, agenda: true },
  });
  const agenda = from ? readAgendaSnapshot(from.agenda) : null;
  if (!from || !agenda) return 0;
  const unresolved: AgendaItem[] = agenda.sections.flatMap((s) => s.items.filter((i) => !i.resolvedAt));
  if (unresolved.length === 0) return 0;

  const next = await db.ceremonyOccurrence.findFirst({
    where: { ceremonyId: from.ceremonyId, scheduledStart: { gt: from.scheduledStart } },
    orderBy: { scheduledStart: "asc" },
    select: { id: true, agenda: true },
  });
  const nextAgenda = next ? readAgendaSnapshot(next.agenda) : null;
  if (!next || !nextAgenda) return 0;

  const target = nextAgenda.sections.find((s) => s.type === "carried_over") ?? nextAgenda.sections[0];
  if (!target) return 0;
  const existing = new Set(target.items.map((i) => i.id));
  let seeded = 0;
  for (const item of unresolved) {
    const id = `${target.key}:carried:${item.refType}:${item.refId}`;
    if (existing.has(id)) continue;
    target.items.push({ ...item, id, sectionKey: target.key, carriedFromOccurrenceId: from.id, resolvedAt: null, order: target.items.length });
    seeded += 1;
  }
  if (seeded === 0) return 0;
  target.emptyReason = null;
  await db.ceremonyOccurrence.update({
    where: { id: next.id },
    data: { agenda: nextAgenda as unknown as Prisma.InputJsonValue },
  });
  return seeded;
}

/**
 * A linked recording's summary landed: the occurrence was captured. Only
 * moves forward from the pre-meeting states, then carries unresolved items
 * on. Never throws — instrumentation must not fail summarisation.
 */
export async function markOccurrenceCaptured(db: PrismaClient, occurrenceId: string): Promise<boolean> {
  try {
    const { count } = await db.ceremonyOccurrence.updateMany({
      where: { id: occurrenceId, status: { in: ["PLANNED", "AGENDA_CIRCULATED", "IN_PROGRESS"] } },
      data: { status: "CAPTURED" },
    });
    if (count === 0) return false;
    await carryOverToNext(db, occurrenceId);
    return true;
  } catch (error) {
    console.error("[ceremonies] markOccurrenceCaptured failed:", error);
    return false;
  }
}
