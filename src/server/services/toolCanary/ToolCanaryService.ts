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
  const { key, state, since } = value;
  if (typeof key !== "string" || (state !== "failing" && state !== "recovered")) return undefined;
  return { key, state, since: typeof since === "string" ? since : "" };
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

async function announce(lead: string, emoji: string, subject: CanarySubject, ticket: CanaryTicket): Promise<void> {
  const url = ticketUrl(ticket);
  await postMatrixOpsMessage({
    body: `${emoji} ${lead}: ${subject.label}\n${url}`,
    formattedBody: `${emoji} <strong>${escapeHtml(lead)}:</strong> ${escapeHtml(subject.label)}<br/><a href="${url}">Open ticket</a>`,
  });
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
 * were announced either way.
 */
export async function applyCanarySubjects(
  db: PrismaClient,
  subjects: readonly CanarySubject[],
  now: Date = new Date(),
): Promise<{ announced: string[]; recovered: string[] }> {
  const announced: string[] = [];
  const recovered: string[] = [];

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
      if (previous?.state === "failing" && previous.key === subject.key) continue; // Nothing new: write nothing.

      const claimed = await claimState(db, ticket, { key: subject.key, state: "failing", since: now.toISOString() });
      // A ticket the canary had marked recovered is failing again: that is
      // news, where a ticket first filed from someone's chat is not.
      if (claimed && !result.created && previous?.state === "recovered") {
        await announce("Tool canary, failing again", "🔴", subject, ticket);
        announced.push(subject.key);
      }
    } catch (error) {
      console.error(`[tool-canary] could not file ${subject.key}:`, error);
    }
  }

  const okKeys = new Map(subjects.filter((subject) => subject.state === "ok").map((subject) => [subject.key, subject]));
  if (okKeys.size > 0) {
    const failingTickets = await db.ticket.findMany({
      where: { productId: resolveBugProductId(), links: { path: ["toolCanary", "state"], equals: "failing" } },
      select: TICKET_SELECT,
    });
    for (const ticket of failingTickets) {
      const state = canaryStateOf(ticket.links);
      const subject = state ? okKeys.get(state.key) : undefined;
      if (!state || !subject) continue;
      try {
        if (await claimState(db, ticket, { key: state.key, state: "recovered", since: now.toISOString() })) {
          await announce("Tool canary, working again", "✅", subject, ticket);
          recovered.push(state.key);
        }
      } catch (error) {
        console.error(`[tool-canary] could not mark ${state.key} recovered:`, error);
      }
    }
  }

  return { announced, recovered };
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
  if (!baseUrl || !secret) return { ran: false, skipped: "not-configured", failing: [], announced: [], recovered: [] };

  const outcome = await askMastra(baseUrl, secret, deps.fetch ?? fetch);
  if (outcome.kind === "busy") return { ran: false, skipped: "busy", failing: [], announced: [], recovered: [] };

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

  const { announced, recovered } = await applyCanarySubjects(db, subjects, deps.now);
  const failing = subjects.filter((subject) => subject.state === "failing").map((subject) => subject.key);

  if (outcome.kind === "failed") {
    return { ran: true, runnerFailed: outcome.why, failing, announced, recovered };
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
    skippedTools: report.tools
      .filter((tool) => tool.status === "skipped")
      .map((tool) => ({ name: tool.name, reason: tool.reason ?? "no reason given" })),
  };
}
