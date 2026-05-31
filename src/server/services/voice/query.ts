/**
 * Query module (ticket #4) — the `query` coarse tool's server side.
 *
 * Answers read-only natural-language questions SCOPED TO ACTIONS + PROJECTS
 * only (overdue, due today, due this week, inbox, by named project), reusing
 * the existing Prisma read patterns and the fuzzy `matchProject` resolver.
 *
 * Hard scope boundary (CONTEXT.md "Flagged ambiguities", ADR 0001): questions
 * about goals/OKRs/objectives/key-results and blockers/dependencies/Tickets are
 * OUT of v1 scope. Those are DECLINED by voice — never improvised, never
 * fabricated. The out-of-scope check runs FIRST so we decline before attempting
 * an answer.
 *
 * Read-only: every path uses findMany; the confirmation gate is never raised.
 */
import type { PrismaClient } from "@prisma/client";
import { startOfDay, endOfDay, startOfWeek, endOfWeek } from "date-fns";

import { matchProject } from "~/server/services/parsing/ProjectMatcher";
import { boundLength, stripMarkdown } from "~/server/services/voice/speakable";

export type TemporalIntent = "overdue" | "due_today" | "due_this_week" | null;

export interface QueryClassification {
  /** Out-of-v1-scope topic (goals/OKRs/blockers/tickets) → must decline. */
  outOfScope: boolean;
  temporal: TemporalIntent;
  inbox: boolean;
}

export interface QueryResultAction {
  id: string;
  name: string;
  dueDate: Date | null;
  projectName: string | null;
}

export interface QueryResult {
  speakable: string;
  structured: {
    intent: string;
    declined: boolean;
    project: { id: string; name: string } | null;
    actions: QueryResultAction[];
  };
}

// Topics that live on entities outside v1 scope (Objectives, Tickets). Declined
// by voice rather than answered from Action/Project data.
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\bgoals?\b/i,
  /\bobjectives?\b/i,
  /\bokrs?\b/i,
  /\bkey results?\b/i,
  /\bkpis?\b/i,
  /\bblock(?:ed|er|ers|ing)\b/i,
  /\bdepend(?:s|ency|encies|ent)?\b/i,
  /\bwaiting on\b/i,
  /\btickets?\b/i,
];

/**
 * Pure intent classification from the raw phrase. Out-of-scope is detected
 * first and shortcuts everything else.
 */
export function classifyQuery(phrase: string): QueryClassification {
  const text = phrase.toLowerCase();

  if (OUT_OF_SCOPE_PATTERNS.some((re) => re.test(text))) {
    return { outOfScope: true, temporal: null, inbox: false };
  }

  const inbox = /\binbox\b/.test(text);

  let temporal: TemporalIntent = null;
  if (/\boverdue\b|\bpast due\b|\blate\b/.test(text)) {
    temporal = "overdue";
  } else if (/\bthis week\b|\bthe week\b|\bweek\b/.test(text)) {
    temporal = "due_this_week";
  } else if (/\btoday\b/.test(text)) {
    temporal = "due_today";
  }

  return { outOfScope: false, temporal, inbox };
}

const DECLINE_SPEAKABLE =
  "I can't answer questions about goals, OKRs, or blockers by voice yet. " +
  "Ask me about your actions or projects.";

/**
 * Run a read-only Action/Project query. Declines out-of-scope topics. Never
 * writes; never gates.
 */
export async function runQuery(
  phrase: string,
  userId: string,
  db: PrismaClient,
  now: Date = new Date(),
): Promise<QueryResult> {
  const cls = classifyQuery(phrase);

  if (cls.outOfScope) {
    return {
      speakable: DECLINE_SPEAKABLE,
      structured: { intent: "out_of_scope", declined: true, project: null, actions: [] },
    };
  }

  // Resolve a named project ("in Acme") against the user's active projects.
  const projects = await db.project.findMany({
    where: { createdById: userId, status: { not: "COMPLETED" } },
    select: { id: true, name: true },
  });
  const matched = cls.inbox ? null : resolveProject(phrase, projects);

  const where: Record<string, unknown> = {
    createdById: userId,
    status: { not: "COMPLETED" },
  };

  if (cls.inbox) {
    where.projectId = null;
  } else if (matched) {
    where.projectId = matched.id;
  }

  if (cls.temporal === "overdue") {
    where.dueDate = { lt: startOfDay(now) };
  } else if (cls.temporal === "due_today") {
    where.dueDate = { gte: startOfDay(now), lte: endOfDay(now) };
  } else if (cls.temporal === "due_this_week") {
    where.dueDate = {
      gte: startOfWeek(now, { weekStartsOn: 1 }),
      lte: endOfWeek(now, { weekStartsOn: 1 }),
    };
  }

  // A bare query with no temporal, no inbox, and no project match is too vague
  // to answer from Action data — prompt rather than dump everything.
  const hasScope = cls.inbox || cls.temporal !== null || matched !== null;
  if (!hasScope) {
    return {
      speakable:
        "I can tell you what's overdue, due today, due this week, in your inbox, " +
        "or in a project. Which would you like?",
      structured: { intent: "needs_scope", declined: false, project: null, actions: [] },
    };
  }

  const rows = await db.action.findMany({
    where,
    select: {
      id: true,
      name: true,
      dueDate: true,
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    take: 50,
  });

  const actions: QueryResultAction[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    dueDate: r.dueDate,
    projectName: r.project?.name ?? null,
  }));

  const scope = scopePhrase(cls, matched?.name ?? null);
  const intent = cls.inbox
    ? "inbox"
    : `${cls.temporal ?? "open"}${matched ? "_by_project" : ""}`;

  return {
    speakable: describeActions(scope, cls.inbox, actions.map((a) => a.name)),
    structured: {
      intent,
      declined: false,
      project: matched ? { id: matched.id, name: matched.name } : null,
      actions,
    },
  };
}

/**
 * Resolve a named project from the phrase. Tries the shared pattern matcher
 * first ("the Acme project", "for Acme"), then falls back to a direct
 * word-boundary name match so a bare "in Acme" still resolves — the matcher's
 * patterns require the literal word "project", which voice questions often omit.
 */
function resolveProject(
  phrase: string,
  projects: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const m = matchProject(phrase, projects).project;
  if (m) return { id: m.id, name: m.name };

  for (const p of projects) {
    if (!p.name) continue;
    const re = new RegExp(`\\b${escapeRegExp(p.name)}\\b`, "i");
    if (re.test(phrase)) return { id: p.id, name: p.name };
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Build the human phrase for the matched scope, e.g. "due this week in Acme". */
function scopePhrase(cls: QueryClassification, projectName: string | null): string {
  if (cls.inbox) return "in your inbox";
  const temporal =
    cls.temporal === "overdue"
      ? "overdue"
      : cls.temporal === "due_today"
        ? "due today"
        : cls.temporal === "due_this_week"
          ? "due this week"
          : null;
  const inProject = projectName ? `in ${stripMarkdown(projectName)}` : null;
  return [temporal, inProject].filter(Boolean).join(" ") || "open";
}

/** Pure: render a count + up to two named actions into a bounded spoken answer. */
export function describeActions(scope: string, inbox: boolean, names: string[]): string {
  const n = names.length;
  if (n === 0) {
    return inbox ? "Your inbox is empty." : `You have nothing ${scope}.`;
  }
  const noun = n === 1 ? "action" : "actions";
  const lead = inbox
    ? `Your inbox has ${n} ${noun}`
    : `You have ${n} ${noun} ${scope}`;
  const shown = names.slice(0, 2).map((s) => stripMarkdown(s));
  const tail = n <= 2 ? `: ${joinList(shown)}.` : `, including ${joinList(shown)}.`;
  return boundLength(lead + tail);
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
