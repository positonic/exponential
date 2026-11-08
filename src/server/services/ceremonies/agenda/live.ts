/**
 * Read-time enrichment of an agenda snapshot (ADR-0059, V9): every item that
 * references an Action or a Decision gets the record's current state on
 * `item.live`. The snapshot itself is never rewritten, so a status change
 * made elsewhere (an Action completed from the actions page, a Decision
 * accepted in the Decision Log) shows on the next read with no regeneration.
 *
 * One query per record type, bounded by the agenda's item count.
 */
import type { PrismaClient } from "@prisma/client";
import { buildActionAccessWhere } from "~/server/services/access/resolvers/actionResolver";
import { buildDecisionAccessWhere } from "~/server/services/access/resolvers/decisionResolver";
import type { AgendaItem, AgendaItemLive, AgendaSnapshot } from "./types";

export async function enrichAgendaLive(
  db: PrismaClient,
  agenda: AgendaSnapshot,
  scope: { workspaceId: string; userId: string },
): Promise<AgendaSnapshot> {
  const actionIds = new Set<string>();
  const decisionIds = new Set<string>();
  for (const section of agenda.sections) {
    for (const item of section.items) {
      if (item.refType === "action") actionIds.add(item.refId);
      else if (item.refType === "decision") decisionIds.add(item.refId);
    }
  }
  if (actionIds.size === 0 && decisionIds.size === 0) return agenda;

  const [actions, decisions] = await Promise.all([
    actionIds.size
      ? db.action.findMany({
          // Only actions this viewer may read, in this workspace: the agenda
          // already names them, but owners and status are the action's data.
          where: { id: { in: [...actionIds] }, workspaceId: scope.workspaceId, AND: [buildActionAccessWhere(scope.userId)] },
          select: {
            id: true,
            status: true,
            completedAt: true,
            dueDate: true,
            assignees: { select: { user: { select: { id: true, name: true, image: true } } } },
          },
        })
      : Promise.resolve([]),
    decisionIds.size
      ? db.decision.findMany({
          where: { id: { in: [...decisionIds] }, AND: [buildDecisionAccessWhere(scope.userId, scope.workspaceId)] },
          select: { id: true, status: true, number: true },
        })
      : Promise.resolve([]),
  ]);

  const live = new Map<string, AgendaItemLive>();
  for (const a of actions) {
    live.set(`action:${a.id}`, {
      kind: "action",
      status: a.status,
      completedAt: a.completedAt?.toISOString() ?? null,
      dueDate: a.dueDate?.toISOString() ?? null,
      assignees: a.assignees.map((x) => x.user),
    });
  }
  for (const d of decisions) live.set(`decision:${d.id}`, { kind: "decision", status: d.status, number: d.number });

  return {
    ...agenda,
    sections: agenda.sections.map((section) => ({
      ...section,
      items: section.items.map((item) => {
        const state = live.get(`${item.refType}:${item.refId}`);
        return state ? { ...item, live: state } : item;
      }),
    })),
  };
}

/** Action statuses that close the work: nothing left to carry. */
const SETTLED_ACTION: ReadonlySet<string> = new Set(["COMPLETED", "CANCELLED", "DELETED"]);
/** Decision statuses that no longer ask for a decision. */
const SETTLED_DECISION: ReadonlySet<string> = new Set(["ACCEPTED", "SUPERSEDED", "DEPRECATED"]);

/**
 * The items that still need carrying to the next occurrence: not ticked,
 * and, for an item that references a record, the record still open. An
 * Action completed from the actions page (or a Decision accepted in the Log)
 * is settled though nobody ticked its line. Server-side bookkeeping, so not
 * viewer-scoped. One query per record type.
 */
export async function filterUnsettledItems<T extends Pick<AgendaItem, "refType" | "refId" | "resolvedAt">>(
  db: PrismaClient,
  items: T[],
): Promise<T[]> {
  const open = items.filter((i) => !i.resolvedAt);
  const actionIds = [...new Set(open.filter((i) => i.refType === "action").map((i) => i.refId))];
  const decisionIds = [...new Set(open.filter((i) => i.refType === "decision").map((i) => i.refId))];
  const [actions, decisions] = await Promise.all([
    actionIds.length ? db.action.findMany({ where: { id: { in: actionIds } }, select: { id: true, status: true } }) : Promise.resolve([]),
    decisionIds.length ? db.decision.findMany({ where: { id: { in: decisionIds } }, select: { id: true, status: true } }) : Promise.resolve([]),
  ]);
  const actionStatus = new Map(actions.map((a) => [a.id, a.status]));
  const decisionStatus = new Map(decisions.map((d) => [d.id, d.status]));
  return open.filter((item) => {
    if (item.refType === "action") {
      const status = actionStatus.get(item.refId);
      // A deleted row has nothing left to chase.
      return status !== undefined && !SETTLED_ACTION.has(status);
    }
    if (item.refType === "decision") {
      const status = decisionStatus.get(item.refId);
      // A deleted Decision, like a deleted Action, has nothing left to carry.
      return status !== undefined && !SETTLED_DECISION.has(status);
    }
    return true;
  });
}
