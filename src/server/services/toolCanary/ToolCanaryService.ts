import type { Prisma, PrismaClient } from "@prisma/client";

import { ticketUrlId } from "~/lib/fun-ids";
import { getPublicBaseUrlFromEnv } from "~/lib/urls";
import type { ClientErrorReport } from "~/server/services/clientErrors/clientErrorBug";
import { resolveBugProductId } from "~/server/services/sentry/SentryBugService";
import { escapeHtml, postMatrixOpsMessage } from "~/server/services/sentry/sentryMatrix";
import { fileHandledErrorBug } from "~/server/utils/reportHandledErrorServer";
import { maskTokenLike } from "~/server/utils/redactToolArgs";

import {
  RUNNER_SUBJECT,
  TOOL_CANARY_AREA,
  canarySubjects,
  toolCanaryReportSchema,
  type CanarySubject,
  type ToolCanaryReport,
} from "./toolCanaryReport";

/**
 * Tool canary, app side (ticket 959).
 *
 * Asks the assistant service to run the canary, then makes its findings
 * visible exactly once each:
 *
 *  - a broken tool is filed through the same ingest as the chat route's
 *    `agent-tool` reports (PR 1184), so it lands on one deduplicated ticket
 *    and the ingest announces it in the ops room when the ticket is created.
 *    A second failing run dedups and says nothing;
 *  - when a tool that was failing answers again, the ops room hears it once.
 *
 * "Was failing" has to survive between cron runs without a schema change, so
 * it lives in the ticket's `links` JSON as `toolCanary: { key, state }`, next
 * to the ingest's own `sentryIssueId`. It is written only when the state
 * changes, so a run that finds nothing new writes nothing.
 */

const MASTRA_ROUTE = "/api/ops/tool-canary";
const SECRET_HEADER = "X-Canary-Secret";
/** Under the route's 300s limit, leaving time to file what was found. */
const MASTRA_TIMEOUT_MS = 270_000;

interface CanaryTicketState {
  key: string;
  state: "failing" | "recovered";
  since: string;
  /** What the ops room calls this subject, kept so a missed post can be retried. */
  label?: string;
  /** The ops-room post for this state did not go out. The next run retries it. */
  unannounced?: true;
}

export interface ToolCanaryCheckResult {
  /** False when the canary is switched off here or already running there. */
  ran: boolean;
  skipped?: "not-configured" | "busy";
  /** The canary could not produce a report at all. The cron answers 5xx so its monitor turns red. */
  runnerFailed?: string;
  counts?: ToolCanaryReport["counts"];
  durationMs?: number;
  target?: string;
  /** Subject keys failing in this run. */
  failing: string[];
  /** Subject keys newly filed or re-announced in this run. */
  announced: string[];
  /** Subject keys announced as working again in this run. */
  recovered: string[];
  /**
   * Subject keys whose ticket could not be filed. Not empty means the canary
   * found faults nobody was told about, so the cron answers 5xx.
   */
  fileErrors: string[];
  /** Tools skipped, with the reason, so the run's response lists every tool. */
  skippedTools?: Array<{ name: string; reason: string }>;
}

type Fetch = typeof fetch;

type RunnerOutcome =
  | { kind: "report"; report: ToolCanaryReport }
  | { kind: "busy" }
  | { kind: "failed"; why: string; detail: string };

async function askMastra(baseUrl: string, secret: string, fetchImpl: Fetch): Promise<RunnerOutcome> {
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl.replace(/\/+$/, "")}${MASTRA_ROUTE}`, {
      method: "POST",
      headers: { [SECRET_HEADER]: secret },
      signal: AbortSignal.timeout(MASTRA_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      kind: "failed",
      why: "the assistant service did not answer",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  if (response.status === 409) return { kind: "busy" };
  const text = await response.text().catch(() => "");
  if (!response.ok) {
    // The status is part of the dedup title on purpose: "503, not configured"
    // and "401, wrong secret" are different things to fix.
    return { kind: "failed", why: `the assistant service answered ${response.status}`, detail: text.slice(0, 1500) };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: "failed", why: "the report could not be read", detail: text.slice(0, 1500) };
  }
  const parsed = toolCanaryReportSchema.safeParse(json);
  if (!parsed.success) {
    return { kind: "failed", why: "the report could not be read", detail: parsed.error.message.slice(0, 1500) };
  }
  return { kind: "report", report: parsed.data };
}

function canaryStateOf(links: Prisma.JsonValue | null): CanaryTicketState | undefined {
  if (!links || typeof links !== "object" || Array.isArray(links)) return undefined;
  const value = links.toolCanary;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const { key, state, since, label, unannounced } = value;
  if (typeof key !== "string" || (state !== "failing" && state !== "recovered")) return undefined;
  return {
    key,
    state,
    since: typeof since === "string" ? since : "",
    ...(typeof label === "string" ? { label } : {}),
    ...(unannounced === true ? { unannounced: true as const } : {}),
  };
}

const TICKET_SELECT = {
  id: true,
  number: true,
  title: true,
  links: true,
  updatedAt: true,
  product: { select: { slug: true, workspace: { select: { slug: true } } } },
} as const;

type CanaryTicket = Prisma.TicketGetPayload<{ select: typeof TICKET_SELECT }>;

function ticketUrl(ticket: CanaryTicket): string {
  return `${getPublicBaseUrlFromEnv()}/w/${ticket.product.workspace.slug}/products/${ticket.product.slug}/tickets/${ticketUrlId(ticket)}`;
}

/**
 * Write the canary's state onto a ticket, only if the row is still the one
 * that was read. Two overlapping runs can both see the same transition; the
 * compare-and-set on `updatedAt` lets one of them announce it.
 */
async function claimState(db: PrismaClient, ticket: CanaryTicket, next: CanaryTicketState): Promise<boolean> {
  const links = ticket.links && typeof ticket.links === "object" && !Array.isArray(ticket.links) ? ticket.links : {};
  const claim = await db.ticket.updateMany({
    where: { id: ticket.id, updatedAt: ticket.updatedAt },
    data: { links: { ...links, toolCanary: { ...next } } },
  });
  return claim.count > 0;
}

const LEADS = {
  failingAgain: { lead: "Tool canary, failing again", emoji: "🔴" },
  recovered: { lead: "Tool canary, working again", emoji: "✅" },
} as const;

/** Post one line to the ops room. False when it did not go out (send failed, or Matrix is not configured). */
async function announce(kind: keyof typeof LEADS, label: string, ticket: CanaryTicket): Promise<boolean> {
  const { lead, emoji } = LEADS[kind];
  const url = ticketUrl(ticket);
  return postMatrixOpsMessage({
    body: `${emoji} ${lead}: ${label}\n${url}`,
    formattedBody: `${emoji} <strong>${escapeHtml(lead)}:</strong> ${escapeHtml(label)}<br/><a href="${url}">Open ticket</a>`,
  });
}

/**
 * Announce a state the ticket has just been claimed into. The claim comes
 * first so two overlapping runs cannot both post; if the post then does not
 * go out, the ticket is flagged `unannounced` so a later run retries it
 * instead of the news being lost with the state already recorded.
 */
async function announceClaimed(
  db: PrismaClient,
  kind: keyof typeof LEADS,
  ticket: CanaryTicket,
  state: CanaryTicketState,
): Promise<boolean> {
  if (await announce(kind, state.label ?? state.key, ticket)) return true;
  const links = ticket.links && typeof ticket.links === "object" && !Array.isArray(ticket.links) ? ticket.links : {};
  await db.ticket.updateMany({
    where: { id: ticket.id },
    data: { links: { ...links, toolCanary: { ...state, unannounced: true } } },
  });
  return false;
}

function masked(report: ClientErrorReport): ClientErrorReport {
  return {
    ...report,
    message: maskTokenLike(report.message),
    ...(report.context
      ? { context: Object.fromEntries(Object.entries(report.context).map(([key, value]) => [key, maskTokenLike(value)])) }
      : {}),
  };
}

/**
 * File what is failing and announce what recovered. Returns the keys that
 * were announced either way, and the keys that could not be filed.
 */
export async function applyCanarySubjects(
  db: PrismaClient,
  subjects: readonly CanarySubject[],
  now: Date = new Date(),
): Promise<{ announced: string[]; recovered: string[]; fileErrors: string[] }> {
  const announced: string[] = [];
  const recovered: string[] = [];
  const fileErrors: string[] = [];
  /** Tickets whose state this run already settled; the retry pass leaves them alone. */
  const touched = new Set<string>();

  for (const subject of subjects) {
    if (subject.state !== "failing") continue;
    // One subject failing to file must not stop the rest being filed.
    try {
      const result = await fileHandledErrorBug(masked(subject.report), { heading: "Tool canary" });
      if (!result) continue; // Bug filing is switched off in this environment.
      // The ingest announced a newly created ticket itself.
      if (result.created) announced.push(subject.key);

      const ticket = await db.ticket.findUnique({ where: { id: result.ticketId }, select: TICKET_SELECT });
      if (!ticket) continue;
      const previous = canaryStateOf(ticket.links);
      // Nothing new: write nothing. (A post still owed for this state is retried below.)
      if (previous?.state === "failing" && previous.key === subject.key) continue;

      touched.add(ticket.id);
      const next: CanaryTicketState = { key: subject.key, state: "failing", since: now.toISOString(), label: subject.label };
      const claimed = await claimState(db, ticket, next);
      // A ticket the canary had marked recovered is failing again: that is
      // news, where a ticket first filed from someone's chat is not.
      if (claimed && !result.created && previous?.state === "recovered") {
        if (await announceClaimed(db, "failingAgain", ticket, next)) announced.push(subject.key);
      }
    } catch (error) {
      console.error(`[tool-canary] could not file ${subject.key}:`, error);
      fileErrors.push(subject.key);
    }
  }

  const okKeys = new Map(subjects.filter((subject) => subject.state === "ok").map((subject) => [subject.key, subject]));
  if (okKeys.size > 0) {
    const failingTickets = await db.ticket.findMany({
      where: { productId: resolveBugProductId(), links: { path: ["toolCanary", "state"], equals: "failing" } },
      select: TICKET_SELECT,
    });
    // Two tickets can carry one key (the fault's title changed between runs,
    // so a second ticket was filed). Both are marked; the room hears it once.
    const posted = new Set<string>();
    for (const ticket of failingTickets) {
      const state = canaryStateOf(ticket.links);
      const subject = state ? okKeys.get(state.key) : undefined;
      if (!state || !subject) continue;
      try {
        const next: CanaryTicketState = { key: state.key, state: "recovered", since: now.toISOString(), label: subject.label };
        if (!(await claimState(db, ticket, next))) continue;
        touched.add(ticket.id);
        if (posted.has(state.key)) continue;
        posted.add(state.key);
        if (await announceClaimed(db, "recovered", ticket, next)) recovered.push(state.key);
      } catch (error) {
        console.error(`[tool-canary] could not mark ${state.key} recovered:`, error);
      }
    }
  }

  // Posts an earlier run owed and could not send (the ops room was down).
  // Skipped for anything this run just settled: that state is newer.
  try {
    const owed = await db.ticket.findMany({
      where: { productId: resolveBugProductId(), links: { path: ["toolCanary", "unannounced"], equals: true } },
      select: TICKET_SELECT,
    });
    for (const ticket of owed) {
      const state = canaryStateOf(ticket.links);
      if (!state?.unannounced || touched.has(ticket.id)) continue;
      const kind = state.state === "recovered" ? "recovered" : "failingAgain";
      if (!(await announce(kind, state.label ?? state.key, ticket))) continue;
      await claimState(db, ticket, {
        key: state.key,
        state: state.state,
        since: state.since,
        ...(state.label ? { label: state.label } : {}),
      });
      (kind === "recovered" ? recovered : announced).push(state.key);
    }
  } catch (error) {
    console.error("[tool-canary] could not retry owed announcements:", error);
  }

  return { announced, recovered, fileErrors };
}

/**
 * One canary run, end to end. Never throws: a canary that cannot run is
 * itself a finding, filed like any other.
 */
export async function runToolCanaryCheck(
  db: PrismaClient,
  deps: { fetch?: Fetch; env?: Record<string, string | undefined>; now?: Date } = {},
): Promise<ToolCanaryCheckResult> {
  const env = deps.env ?? process.env;
  const baseUrl = env.MASTRA_API_URL?.trim();
  const secret = env.TOOL_CANARY_SECRET?.trim();
  // Off until someone turns it on: an unconfigured canary is not an outage.
  if (!baseUrl || !secret) {
    return { ran: false, skipped: "not-configured", failing: [], announced: [], recovered: [], fileErrors: [] };
  }

  const outcome = await askMastra(baseUrl, secret, deps.fetch ?? fetch);
  if (outcome.kind === "busy") {
    return { ran: false, skipped: "busy", failing: [], announced: [], recovered: [], fileErrors: [] };
  }

  const runnerLabel = "the tool canary itself";
  const subjects: CanarySubject[] =
    outcome.kind === "failed"
      ? [
          {
            key: RUNNER_SUBJECT,
            label: runnerLabel,
            state: "failing",
            report: {
              area: TOOL_CANARY_AREA,
              message: `the tool canary could not run (${outcome.why})`,
              context: { detail: outcome.detail },
            },
          },
        ]
      : [{ key: RUNNER_SUBJECT, label: runnerLabel, state: "ok" }, ...canarySubjects(outcome.report)];

  const { announced, recovered, fileErrors } = await applyCanarySubjects(db, subjects, deps.now);
  const failing = subjects.filter((subject) => subject.state === "failing").map((subject) => subject.key);

  if (outcome.kind === "failed") {
    return { ran: true, runnerFailed: outcome.why, failing, announced, recovered, fileErrors };
  }
  const { report } = outcome;
  return {
    ran: true,
    counts: report.counts,
    durationMs: report.durationMs,
    target: report.target.origin,
    failing,
    announced,
    recovered,
    fileErrors,
    skippedTools: report.tools
      .filter((tool) => tool.status === "skipped")
      .map((tool) => ({ name: tool.name, reason: tool.reason ?? "no reason given" })),
  };
}
