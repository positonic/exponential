/**
 * Per-item state on an agenda snapshot (ADR-0059): mark resolved / unresolved,
 * the CAPTURED transition when a linked recording is summarised, and the
 * carry-over of unresolved items into the next occurrence.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { readAgendaSnapshot, type AgendaItem, type AgendaItemKind, type AgendaSnapshot } from "./types";
import type { ActionActor } from "~/server/services/actions/types";
import { buildDecisionAccessWhere, buildWorkspaceAudienceDecisionWhere } from "~/server/services/access/resolvers/decisionResolver";
import { appendMeetingSummaryToNotes } from "../notesSeed";
import { filterUnsettledItems } from "./live";

/**
 * Loaded on the failure path only: the reporter imports the Prisma singleton,
 * and this module is imported by routers and meeting services whose unit
 * tests run without one.
 */
async function reportCaptureError(error: unknown, occurrenceId: string): Promise<void> {
  const { reportHandledErrorServer } = await import("~/server/utils/reportHandledErrorServer");
  reportHandledErrorServer(error, { area: "ceremonies.appendMeetingSummaryToNotes", context: { occurrenceId } });
}

/**
 * Every read-modify-write of the agenda JSON runs in a serializable
 * transaction, retried once on a serialization failure, so two people
 * editing the same occurrence at once cannot clobber each other's change.
 */
export async function withAgendaTransaction<T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "P2034" && attempt === 0) continue;
      throw error;
    }
  }
}

export async function setAgendaItemResolved(
  db: PrismaClient,
  occurrenceId: string,
  itemId: string,
  resolved: boolean,
  now = new Date(),
): Promise<AgendaSnapshot> {
  return withAgendaTransaction(db, async (tx) => {
    const occurrence = await tx.ceremonyOccurrence.findUnique({ where: { id: occurrenceId }, select: { agenda: true } });
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
    await tx.ceremonyOccurrence.update({
      where: { id: occurrenceId },
      data: { agenda: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  });
}

/**
 * Tick or untick an agenda item (V9). On an item that references an Action
 * the Action itself is completed or reopened, through the Action write
 * module and its edit gate, so the agenda and the owner's list never
 * disagree; then the item's own `resolvedAt` follows. Other items only flip
 * `resolvedAt`.
 */
export async function resolveAgendaItem(
  db: PrismaClient,
  occurrenceId: string,
  itemId: string,
  resolved: boolean,
  actor: ActionActor,
  now = new Date(),
): Promise<AgendaSnapshot> {
  const occurrence = await db.ceremonyOccurrence.findUnique({ where: { id: occurrenceId }, select: { agenda: true } });
  const agenda = occurrence ? readAgendaSnapshot(occurrence.agenda) : null;
  if (!agenda) throw new TRPCError({ code: "NOT_FOUND", message: "This occurrence has no agenda yet" });
  const item = agenda.sections.flatMap((s) => s.items).find((i) => i.id === itemId);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Agenda item not found" });
  if (item.refType === "action") {
    // Lazy for the same reason as createAction in addAgendaItem.
    const { applyActionUpdate } = await import("~/server/services/actions/applyActionUpdate");
    await applyActionUpdate({ db, actor }, item.refId, { status: resolved ? "COMPLETED" : "ACTIVE" });
  }
  return setAgendaItemResolved(db, occurrenceId, itemId, resolved, now);
}

export interface AddAgendaItemInput {
  sectionKey: string;
  title: string;
  /** Markdown. A note's supporting line; an action's description. */
  detail?: string | null;
  /** Who added it (`addedByUserId`); hand items survive regeneration. */
  userId: string;
  /** What the item is (V9). Omitted means a note, the shape every caller used before kinds existed. */
  kind?: AgendaItemKind;
  /** kind "action": the owner; omitted leaves the Action unassigned. */
  assigneeId?: string | null;
  /** kind "action": when it is due. */
  dueDate?: Date | null;
  /** kind "action": the writer, for the Action write module's gates. Required for that kind. */
  actor?: ActionActor;
  /** kind "decision": the Decision to link, by id or by its number (150 for D-0150). */
  decisionId?: string | null;
  decisionNumber?: number | null;
}

/**
 * A person (or an agent) adds an item by hand; it survives regeneration
 * (buildAgenda keeps `addedByUserId` items). A note is prose on the
 * snapshot. An action item creates a real Action first, through the Action
 * write module, in the ceremony's project when it has exactly one and linked
 * to this occurrence, and the item references it, so the work lands on its
 * owner's list and is chased like any Action.
 */
export async function addAgendaItem(
  db: PrismaClient,
  occurrenceId: string,
  input: AddAgendaItemInput,
  now = new Date(),
): Promise<AgendaSnapshot> {
  const kind = input.kind ?? "note";
  const title = input.title.trim();
  const detail = input.detail?.trim() ? input.detail.trim() : null;

  if (kind === "action") {
    if (!input.actor) throw new TRPCError({ code: "BAD_REQUEST", message: "An action item needs the writer's identity" });
    const occurrence = await db.ceremonyOccurrence.findUnique({
      where: { id: occurrenceId },
      select: {
        workspaceId: true,
        agenda: true,
        ceremony: { select: { projects: { select: { projectId: true } }, workspace: { select: { slug: true } } } },
      },
    });
    const agenda = occurrence ? readAgendaSnapshot(occurrence.agenda) : null;
    if (!occurrence || !agenda) throw new TRPCError({ code: "NOT_FOUND", message: "This occurrence has no agenda yet" });
    // Refuse before creating anything: an Action for a section that does not exist would be orphaned.
    if (!agenda.sections.some((s) => s.key === input.sectionKey)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Agenda section not found" });
    }
    const projects = occurrence.ceremony.projects;
    // Loaded here, not at the top: the Action write module reaches the Prisma
    // singleton at load, and this module is imported by routers and meeting
    // services whose unit tests run without one (see reportCaptureError).
    const { createAction } = await import("~/server/services/actions/createAction");
    const action = await createAction(
      { db, actor: input.actor },
      {
        name: title,
        ...(detail ? { description: detail } : {}),
        source: "ceremony",
        workspaceId: occurrence.workspaceId,
        ...(projects.length === 1 ? { projectId: projects[0]!.projectId } : {}),
        ...(input.assigneeId ? { assigneeIds: [input.assigneeId] } : {}),
        ...(input.dueDate ? { dueDate: input.dueDate } : {}),
        occurrenceId,
      },
    );
    try {
      return await writeHandItem(db, occurrenceId, input.sectionKey, now, (id) => ({
        id,
        title,
        refType: "action",
        refId: action.id,
        addedByUserId: input.userId,
        detail,
        href: `/w/${occurrence.ceremony.workspace.slug}/actions/${action.id}`,
      }));
    } catch (error) {
      // The Action is committed and stays; say which one, so it is not lost.
      throw new TRPCError({
        code: error instanceof TRPCError ? error.code : "INTERNAL_SERVER_ERROR",
        message: `Created the action "${title}" (${action.id}) but could not add it to the agenda`,
        cause: error,
      });
    }
  }

  if (kind === "decision") {
    // Links an existing Decision; never creates one. Creation stays with
    // decision.create and its draft-confirm rules (ADR-0070).
    const occurrence = await db.ceremonyOccurrence.findUnique({
      where: { id: occurrenceId },
      select: { workspaceId: true, ceremony: { select: { workspace: { select: { slug: true } } } } },
    });
    if (!occurrence) throw new TRPCError({ code: "NOT_FOUND", message: "Occurrence not found" });
    if (!input.decisionId && !input.decisionNumber) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A decision item needs a decision id or D-number" });
    }
    const ref = input.decisionId ? { id: input.decisionId } : { number: input.decisionNumber! };
    // The adder must be able to read it (a restricted one reads as not
    // found, as the decision router would answer) …
    const decision = await db.decision.findFirst({
      where: { ...ref, AND: [buildDecisionAccessWhere(input.userId, occurrence.workspaceId)] },
      select: { id: true, statement: true },
    });
    if (!decision) throw new TRPCError({ code: "NOT_FOUND", message: "Decision not found in this workspace" });
    // … and so must everyone else: the statement is copied into a snapshot
    // every workspace member reads and that is circulated by notification
    // and Matrix. One behind a restricted project or a private recording is
    // refused, though the adder can read it.
    const shareable = await db.decision.count({
      where: { id: decision.id, AND: [buildWorkspaceAudienceDecisionWhere(occurrence.workspaceId)] },
    });
    if (shareable === 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "That decision is in a restricted project or a private meeting, so it can't go on an agenda the whole workspace reads",
      });
    }
    return writeHandItem(db, occurrenceId, input.sectionKey, now, (id) => ({
      id,
      title: title || decision.statement,
      refType: "decision",
      refId: decision.id,
      addedByUserId: input.userId,
      // The D-number and live status render from `live` (enrichAgendaLive).
      detail,
      href: `/w/${occurrence.ceremony.workspace.slug}/decisions/d/${decision.id}`,
    }));
  }

  return writeHandItem(db, occurrenceId, input.sectionKey, now, (id) => ({
    id,
    title,
    refType: "text",
    refId: id,
    addedByUserId: input.userId,
    detail,
  }));
}

/** Append one hand item to a section inside the agenda transaction. */
async function writeHandItem(
  db: PrismaClient,
  occurrenceId: string,
  sectionKey: string,
  now: Date,
  build: (id: string) => Omit<AgendaItem, "sectionKey" | "order">,
): Promise<AgendaSnapshot> {
  return withAgendaTransaction(db, async (tx) => {
    const occurrence = await tx.ceremonyOccurrence.findUnique({ where: { id: occurrenceId }, select: { agenda: true } });
    const agenda = occurrence ? readAgendaSnapshot(occurrence.agenda) : null;
    if (!agenda) throw new TRPCError({ code: "NOT_FOUND", message: "This occurrence has no agenda yet" });
    const section = agenda.sections.find((s) => s.key === sectionKey);
    if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "Agenda section not found" });
    const id = `${section.key}:hand:${now.getTime().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    section.items.push({ ...build(id), sectionKey: section.key, order: section.items.length });
    section.emptyReason = null;
    // An item added after the agenda was sent means participants have an
    // older agenda: the page reads this as "changed since" (agendaChangedSinceSent).
    agenda.editedAt = now.toISOString();
    await tx.ceremonyOccurrence.update({ where: { id: occurrenceId }, data: { agenda: agenda as unknown as Prisma.InputJsonValue } });
    return agenda;
  });
}

/** Reorder one section's items; the new order is kept by buildAgenda on regeneration. */
export async function reorderAgendaItems(
  db: PrismaClient,
  occurrenceId: string,
  input: { sectionKey: string; itemIds: string[] },
): Promise<AgendaSnapshot> {
  return withAgendaTransaction(db, async (tx) => {
    const occurrence = await tx.ceremonyOccurrence.findUnique({ where: { id: occurrenceId }, select: { agenda: true } });
    const agenda = occurrence ? readAgendaSnapshot(occurrence.agenda) : null;
    if (!agenda) throw new TRPCError({ code: "NOT_FOUND", message: "This occurrence has no agenda yet" });
    const section = agenda.sections.find((s) => s.key === input.sectionKey);
    if (!section) throw new TRPCError({ code: "NOT_FOUND", message: "Agenda section not found" });
    const position = new Map(input.itemIds.map((id, i) => [id, i]));
    section.items = section.items
      .slice()
      .sort((a, b) => (position.get(a.id) ?? input.itemIds.length + a.order) - (position.get(b.id) ?? input.itemIds.length + b.order))
      .map((item, index) => ({ ...item, order: index }));
    await tx.ceremonyOccurrence.update({ where: { id: occurrenceId }, data: { agenda: agenda as unknown as Prisma.InputJsonValue } });
    return agenda;
  });
}

/**
 * Unresolved items of `fromOccurrenceId`, seeded into the next occurrence of
 * the same ceremony when that one already has an agenda (otherwise the
 * `carried_over` section picks them up at generation time). Returns how many
 * were seeded.
 */
export async function carryOverToNext(db: PrismaClient, fromOccurrenceId: string): Promise<number> {
  return withAgendaTransaction(db, async (tx) => {
    const from = await tx.ceremonyOccurrence.findUnique({
      where: { id: fromOccurrenceId },
      select: { id: true, ceremonyId: true, scheduledStart: true, agenda: true },
    });
    const agenda = from ? readAgendaSnapshot(from.agenda) : null;
    if (!from || !agenda) return 0;
    // Settled by the record, not only the tick: an Action completed from the
    // actions page is not carried, one reopened there is (filterUnsettledItems).
    const unresolved: AgendaItem[] = await filterUnsettledItems(tx as unknown as PrismaClient, agenda.sections.flatMap((s) => s.items));
    if (unresolved.length === 0) return 0;

    const next = await tx.ceremonyOccurrence.findFirst({
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
    await tx.ceremonyOccurrence.update({
      where: { id: next.id },
      data: { agenda: nextAgenda as unknown as Prisma.InputJsonValue },
    });
    return seeded;
  });
}

/**
 * A linked recording's summary landed: the occurrence was captured. Only
 * moves forward from the pre-meeting states, then carries unresolved items
 * on. Never throws — instrumentation must not fail summarisation.
 */
export async function markOccurrenceCaptured(
  db: PrismaClient,
  occurrenceId: string,
  opts: { summaryMarkdown?: string | null } = {},
): Promise<boolean> {
  try {
    const { count } = await db.ceremonyOccurrence.updateMany({
      where: { id: occurrenceId, status: { in: ["PLANNED", "AGENDA_CIRCULATED", "IN_PROGRESS"] } },
      data: { status: "CAPTURED" },
    });
    if (count === 0) return false;
    await carryOverToNext(db, occurrenceId);
    // The notes page becomes the record of the meeting: the recording's
    // summary goes on the end. Its own failure never blocks the carry-over
    // above or the summary that triggered this.
    if (opts.summaryMarkdown?.trim()) {
      try {
        const res = await appendMeetingSummaryToNotes(db, occurrenceId, opts.summaryMarkdown);
        if (!res.appended && res.reason === "conflict") {
          await reportCaptureError(new Error("Notes page changed twice while appending the meeting summary"), occurrenceId);
        }
      } catch (error) {
        console.error("[ceremonies] appendMeetingSummaryToNotes failed:", error);
        await reportCaptureError(error, occurrenceId);
      }
    }
    return true;
  } catch (error) {
    console.error("[ceremonies] markOccurrenceCaptured failed:", error);
    return false;
  }
}
