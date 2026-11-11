import type { PrismaClient } from "@prisma/client";

import { escapeHtml, postMatrixOpsMessage } from "~/server/services/sentry/sentryMatrix";
import { maskTokenLike } from "~/server/utils/redactToolArgs";

/**
 * Daily agent-health digest for the ops room.
 *
 * Bug tickets catch the turns that *failed outright* — the user saw "Something
 * went wrong". They miss the quieter failures: a tool that errors on every
 * call while the agent narrates around it (get-project-context failing its own
 * output schema for weeks after Outcomes were removed), a web_fetch refused on
 * most URLs. Those never produce a ticket, but they make every answer worse.
 * This reads the last day of AiInteractionHistory and posts what broke, most
 * frequent first. A clean day posts nothing.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Failed turns read per run. Far above a normal day; bounds a bad one. */
const MAX_FAILED_ROWS = 2000;
/** Entries listed per section. */
const TOP_N = 5;
/** Longest error text shown per entry. */
const MAX_LABEL_CHARS = 140;

export interface FailedTurnRow {
  agentId: string | null;
  errorMessage: string | null;
  toolCalls: unknown;
}

export interface DigestEntry {
  label: string;
  count: number;
}

export interface AgentHealthDigest {
  since: Date;
  totalTurns: number;
  failedTurns: number;
  /** Turn-level failures: the agent stream errored, or the stream itself died. */
  turnErrors: DigestEntry[];
  /** Individual tool calls that failed, across all turns. */
  toolErrors: DigestEntry[];
}

/**
 * Collapse occurrences of one fault onto one label: mask credentials, drop
 * the numbers that differ between occurrences (ids, timestamps, indexes),
 * keep the first line, cap the length.
 */
export function normalizeErrorLabel(text: string): string {
  const firstLine = maskTokenLike(text).split("\n")[0] ?? "";
  const clean = firstLine.replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
  return clean.length > MAX_LABEL_CHARS ? `${clean.slice(0, MAX_LABEL_CHARS)}…` : clean;
}

function parseErrorMessage(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    // errorMessage is written truncated at 2000 chars, so long ones aren't JSON.
    return null;
  }
}

/** What made the turn fail, or null when only its tools did. */
function turnErrorOf(row: FailedTurnRow): string | null {
  const parsed = parseErrorMessage(row.errorMessage);
  if (!parsed) return row.errorMessage;
  if (typeof parsed.agentError === "string" && parsed.agentError) return parsed.agentError;
  if (parsed.streamFailed === true && typeof parsed.error === "string") return parsed.error;
  if (parsed.emptyResponse === true) return "empty response (no text from the model)";
  return null;
}

function toolErrorsOf(row: FailedTurnRow): string[] {
  if (!Array.isArray(row.toolCalls)) return [];
  const labels: string[] = [];
  for (const call of row.toolCalls as unknown[]) {
    if (!call || typeof call !== "object") continue;
    const { name, isError, errorCode } = call as {
      name?: unknown;
      isError?: unknown;
      errorCode?: unknown;
    };
    if (isError !== true) continue;
    const tool = typeof name === "string" ? name : "tool";
    labels.push(typeof errorCode === "string" && errorCode ? `${tool}: ${errorCode}` : tool);
  }
  return labels;
}

function rank(labels: string[]): DigestEntry[] {
  const counts = new Map<string, number>();
  for (const label of labels) {
    const key = normalizeErrorLabel(label);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, TOP_N);
}

/** Pure aggregation over one day's failed turns. */
export function buildAgentHealthDigest(
  rows: FailedTurnRow[],
  totalTurns: number,
  since: Date,
): AgentHealthDigest {
  const turnErrors: string[] = [];
  const toolErrors: string[] = [];
  for (const row of rows) {
    const turnError = turnErrorOf(row);
    if (turnError) turnErrors.push(row.agentId ? `[${row.agentId}] ${turnError}` : turnError);
    toolErrors.push(...toolErrorsOf(row));
  }
  return {
    since,
    totalTurns,
    failedTurns: rows.length,
    turnErrors: rank(turnErrors),
    toolErrors: rank(toolErrors),
  };
}

export function hasFindings(digest: AgentHealthDigest): boolean {
  return digest.failedTurns > 0;
}

/** Plain-text and HTML renderings for the Matrix ops room. */
export function formatAgentHealthDigest(digest: AgentHealthDigest): {
  body: string;
  formattedBody: string;
} {
  const rate =
    digest.totalTurns > 0 ? Math.round((digest.failedTurns / digest.totalTurns) * 100) : 0;
  const summary = `${digest.failedTurns} of ${digest.totalTurns} agent turns had errors (${rate}%) in the last 24h`;

  const sections: Array<{ title: string; entries: DigestEntry[] }> = [
    { title: "Turns that failed", entries: digest.turnErrors },
    { title: "Tool calls that failed", entries: digest.toolErrors },
  ].filter((section) => section.entries.length > 0);

  const textLines = [`🩺 Agent health: ${summary}`];
  const htmlParts = [`🩺 <strong>Agent health:</strong> ${escapeHtml(summary)}`];
  for (const section of sections) {
    textLines.push("", `${section.title}:`);
    textLines.push(...section.entries.map((e) => `  ${e.count}× ${e.label}`));
    htmlParts.push(
      `<br/><br/><strong>${section.title}</strong><ul>${section.entries
        .map((e) => `<li>${e.count}× <code>${escapeHtml(e.label)}</code></li>`)
        .join("")}</ul>`,
    );
  }

  return { body: textLines.join("\n"), formattedBody: htmlParts.join("") };
}

export interface AgentHealthDigestResult {
  posted: boolean;
  failedTurns: number;
  totalTurns: number;
}

/** Read the last 24h, and post to the ops room when anything failed. */
export async function sendAgentHealthDigest(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<AgentHealthDigestResult> {
  const since = new Date(now.getTime() - DAY_MS);
  const window = { createdAt: { gte: since, lt: now } };

  const [totalTurns, rows] = await Promise.all([
    db.aiInteractionHistory.count({ where: window }),
    db.aiInteractionHistory.findMany({
      where: { ...window, hadError: true },
      select: { agentId: true, errorMessage: true, toolCalls: true },
      orderBy: { createdAt: "desc" },
      take: MAX_FAILED_ROWS,
    }),
  ]);

  const digest = buildAgentHealthDigest(rows, totalTurns, since);
  if (!hasFindings(digest)) {
    return { posted: false, failedTurns: 0, totalTurns };
  }

  const posted = await postMatrixOpsMessage(formatAgentHealthDigest(digest));
  return { posted, failedTurns: digest.failedTurns, totalTurns };
}
