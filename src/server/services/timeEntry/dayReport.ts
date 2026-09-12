/**
 * The day report (CONTEXT.md "Attention hours"): one day's entries for one
 * person, with the numbers the `/time` day view and the Daily summary's
 * Yesterday line both read (ADR-0059: one builder, two renderers).
 *
 * Pure: entries in, report out. The service loads the rows; this module owns
 * the arithmetic so it can be tested without a database.
 *
 *  - Attention minutes: minutes of the day covered by at least one of the
 *    person's non-agent-run entries, each minute counted once.
 *  - Session minutes: the plain sum of those entries (exceeds attention
 *    whenever threads overlap).
 *  - Agent-run minutes: the sum of `source: "agent-run"` entries, kept off
 *    both figures and shown on their own lane.
 *  - Roll-ups (by Product, by Action): a minute sweep over the non-agent-run
 *    entries credits each covered minute 1/n to each of the n entries
 *    covering it, so the roll-ups sum to attention minutes. Computed on read,
 *    never stored — raw entries stay whole.
 *  - Product resolves through the Action's Ticket first, then its Project;
 *    an entry whose Action has neither is Unassigned time.
 */

import { flagForgottenTimers } from "~/lib/time/forgottenTimer";

export const AGENT_RUN_SOURCE = "agent-run";

export interface DayReportEntryInput {
  id: string;
  actionId: string;
  workspaceId: string | null;
  startedAt: Date;
  endedAt: Date | null;
  source: string;
  status: "PROPOSED" | "CONFIRMED";
  sourceRef: string | null;
  note: string | null;
  createdByAgentId: string | null;
  action: {
    id: string;
    name: string;
    projectId: string | null;
    ticketId: string | null;
    project: { id: string; name: string; productId: string | null } | null;
    ticket: {
      id: string;
      number: number;
      shortId: string | null;
      title: string;
      productId: string;
    } | null;
  };
}

export interface DayReportProduct {
  id: string;
  name: string;
}

export interface DayReportEntry extends DayReportEntryInput {
  /** Whole minutes inside the day window (a running entry ends "now"). */
  minutes: number;
  /** `ticket.productId ?? project.productId ?? null`. */
  productId: string | null;
  productName: string | null;
  isAgentRun: boolean;
  flags: Array<"forgotten-timer">;
}

export interface DayReportProductRow {
  /** Null is Unassigned time. */
  productId: string | null;
  name: string;
  /** Overlap-split minutes; sums to `attentionMinutes` across rows. */
  minutes: number;
}

export interface DayReportActionRow {
  actionId: string;
  name: string;
  /** Overlap-split minutes; sums to `attentionMinutes` across rows. */
  minutes: number;
  /** Plain sum of the Action's non-agent-run entries. */
  sessionMinutes: number;
  agentRunMinutes: number;
  productId: string | null;
  productName: string | null;
  projectId: string | null;
  projectName: string | null;
  ticket: { id: string; number: number; shortId: string | null; title: string } | null;
  proposedCount: number;
}

export interface DayReport {
  dayStart: Date;
  dayEnd: Date;
  entries: DayReportEntry[];
  attentionMinutes: number;
  sessionMinutes: number;
  agentRunMinutes: number;
  byProduct: DayReportProductRow[];
  byAction: DayReportActionRow[];
  /** Non-agent-run entries whose Action has neither Ticket nor Project. */
  unassignedCount: number;
  proposedCount: number;
  /** Entry ids carrying a flag, with the flag. */
  flags: Array<{ entryId: string; flag: "forgotten-timer" }>;
}

export const UNASSIGNED_LABEL = "Unassigned";

function clampToWindow(
  entry: { startedAt: Date; endedAt: Date | null },
  dayStart: Date,
  dayEnd: Date,
  now: Date,
): { startMin: number; endMin: number } | null {
  const start = Math.max(entry.startedAt.getTime(), dayStart.getTime());
  const rawEnd = entry.endedAt?.getTime() ?? now.getTime();
  const end = Math.min(rawEnd, dayEnd.getTime());
  if (end <= start) return null;
  const startMin = Math.floor((start - dayStart.getTime()) / 60_000);
  const endMin = Math.ceil((end - dayStart.getTime()) / 60_000);
  return endMin > startMin ? { startMin, endMin } : null;
}

export function computeDayReport(
  rows: DayReportEntryInput[],
  products: DayReportProduct[],
  dayStart: Date,
  dayEnd: Date,
  now: Date = new Date(),
): DayReport {
  const productName = new Map(products.map((p) => [p.id, p.name]));
  const forgotten = flagForgottenTimers(rows);

  const entries: DayReportEntry[] = [];
  const windows = new Map<string, { startMin: number; endMin: number }>();
  for (const row of rows) {
    const window = clampToWindow(row, dayStart, dayEnd, now);
    if (!window) continue;
    windows.set(row.id, window);
    const productId = row.action.ticket?.productId ?? row.action.project?.productId ?? null;
    entries.push({
      ...row,
      minutes: window.endMin - window.startMin,
      productId,
      productName: productId ? (productName.get(productId) ?? null) : null,
      isAgentRun: row.source === AGENT_RUN_SOURCE,
      flags: forgotten.has(row.id) ? ["forgotten-timer"] : [],
    });
  }

  const human = entries.filter((e) => !e.isAgentRun);
  const totalMinutes = Math.max(0, Math.ceil((dayEnd.getTime() - dayStart.getTime()) / 60_000));

  // Minute sweep: how many human entries cover each minute, then credit 1/n.
  const cover = new Uint16Array(totalMinutes);
  for (const e of human) {
    const w = windows.get(e.id)!;
    for (let m = w.startMin; m < Math.min(w.endMin, totalMinutes); m++) cover[m]!++;
  }
  let attentionMinutes = 0;
  for (let m = 0; m < totalMinutes; m++) if (cover[m]! > 0) attentionMinutes++;

  const split = new Map<string, number>();
  for (const e of human) {
    const w = windows.get(e.id)!;
    let credit = 0;
    for (let m = w.startMin; m < Math.min(w.endMin, totalMinutes); m++) credit += 1 / cover[m]!;
    split.set(e.id, credit);
  }

  const productRows = new Map<string | null, DayReportProductRow>();
  const actionRows = new Map<string, DayReportActionRow>();
  for (const e of entries) {
    const credit = split.get(e.id) ?? 0;
    if (!e.isAgentRun) {
      const key = e.productId;
      const row = productRows.get(key) ?? {
        productId: key,
        name: key ? (e.productName ?? "Product") : UNASSIGNED_LABEL,
        minutes: 0,
      };
      row.minutes += credit;
      productRows.set(key, row);
    }
    const action = actionRows.get(e.actionId) ?? {
      actionId: e.actionId,
      name: e.action.name || "Untitled",
      minutes: 0,
      sessionMinutes: 0,
      agentRunMinutes: 0,
      productId: e.productId,
      productName: e.productName,
      projectId: e.action.projectId,
      projectName: e.action.project?.name ?? null,
      ticket: e.action.ticket
        ? {
            id: e.action.ticket.id,
            number: e.action.ticket.number,
            shortId: e.action.ticket.shortId,
            title: e.action.ticket.title,
          }
        : null,
      proposedCount: 0,
    };
    if (e.isAgentRun) action.agentRunMinutes += e.minutes;
    else {
      action.minutes += credit;
      action.sessionMinutes += e.minutes;
    }
    if (e.status === "PROPOSED") action.proposedCount += 1;
    actionRows.set(e.actionId, action);
  }

  const round = (n: number) => Math.round(n);
  const byProduct = [...productRows.values()]
    .map((r) => ({ ...r, minutes: round(r.minutes) }))
    .sort((a, b) => b.minutes - a.minutes);
  const byAction = [...actionRows.values()]
    .map((r) => ({ ...r, minutes: round(r.minutes) }))
    .sort((a, b) => b.minutes + b.agentRunMinutes - (a.minutes + a.agentRunMinutes));

  return {
    dayStart,
    dayEnd,
    entries: entries.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime()),
    attentionMinutes,
    sessionMinutes: human.reduce((s, e) => s + e.minutes, 0),
    agentRunMinutes: entries.filter((e) => e.isAgentRun).reduce((s, e) => s + e.minutes, 0),
    byProduct,
    byAction,
    unassignedCount: human.filter((e) => !e.action.ticketId && !e.action.projectId).length,
    proposedCount: entries.filter((e) => e.status === "PROPOSED").length,
    flags: entries.flatMap((e) => e.flags.map((flag) => ({ entryId: e.id, flag }))),
  };
}
