/**
 * The decisions producer: what a room hears when a person publishes, accepts or
 * supersedes a Decision (ADR-0075, D-0056).
 *
 * The message is the statement, the status, the deciders and a link — never the body
 * or the evidence, which stay behind the link where ADR-0014's resolver guards them.
 * Deciders are pinged when the decision is *published* (they are the ones who have to
 * answer an open question); status changes name them without pinging.
 */

import type { DecisionStatus, PrismaClient } from "@prisma/client";
import { formatDecisionLabel } from "~/lib/decision-label";
import { markdownToPlainText } from "~/server/services/matrix/renderMeetingSummary";
import type { OutboundSubject, Producer, RenderContext, RenderedMessage } from "../types";

export const DECISION_EVENTS = {
  /** Confirmed by a person: a confirmed create, or a draft confirmed. */
  PUBLISHED: "published",
  ACCEPTED: "accepted",
  SUPERSEDED: "superseded",
  DEPRECATED: "deprecated",
} as const;

export type DecisionEvent = (typeof DECISION_EVENTS)[keyof typeof DECISION_EVENTS];

/** The event a move into `status` emits; `null` for statuses that do not post. */
export function decisionEventForStatus(status: DecisionStatus): DecisionEvent | null {
  switch (status) {
    case "ACCEPTED":
      return DECISION_EVENTS.ACCEPTED;
    case "SUPERSEDED":
      return DECISION_EVENTS.SUPERSEDED;
    case "DEPRECATED":
      return DECISION_EVENTS.DEPRECATED;
    default:
      return null;
  }
}

export interface DecisionSubject extends OutboundSubject {
  id: string;
  number: number;
  statement: string;
  status: DecisionStatus;
  workspaceSlug: string;
  deciders: ReadonlyArray<{ userId: string | null; name: string }>;
  supersededByNumber: number | null;
}

/** Vocabulary from `CONTEXT.md` → Decisions: an `OPEN` decision is an open question. */
export function decisionStatusLabel(subject: Pick<DecisionSubject, "status" | "supersededByNumber">): string {
  switch (subject.status) {
    case "OPEN":
      return "Open question";
    case "PROPOSED":
      return "Proposed";
    case "ACCEPTED":
      return "Accepted";
    case "SUPERSEDED":
      return subject.supersededByNumber !== null
        ? `Superseded by ${formatDecisionLabel(subject.supersededByNumber)}`
        : "Superseded";
    case "DEPRECATED":
      return "Deprecated";
  }
}

/**
 * Decider names are free text (external participants, agent drafts), so in the
 * Markdown twin they must not be able to close a link or open a new one.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]()<>#]/g, (ch) => `\\${ch}`);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function decisionUrl(baseUrl: string, workspaceSlug: string, decisionId: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/w/${workspaceSlug}/decisions/d/${decisionId}`;
}

/** Pure: the three formats a poster may need, plus who to ping. */
export function renderDecisionMessage(
  subject: DecisionSubject,
  event: string,
  ctx: RenderContext,
): RenderedMessage {
  const label = formatDecisionLabel(subject.number);
  // The header says what just happened. On publish that is the status the decision
  // was published in; on a transition it is the transition.
  const headline =
    event === DECISION_EVENTS.PUBLISHED
      ? decisionStatusLabel(subject)
      : event === DECISION_EVENTS.ACCEPTED
        ? "Accepted"
        : event === DECISION_EVENTS.SUPERSEDED
          ? decisionStatusLabel({ status: "SUPERSEDED", supersededByNumber: subject.supersededByNumber })
          : event === DECISION_EVENTS.DEPRECATED
            ? "Deprecated"
            : decisionStatusLabel(subject);
  const header = `${label} · ${headline}`;
  const url = decisionUrl(ctx.baseUrl, subject.workspaceSlug, subject.id);

  const deciders = subject.deciders.map((d) => {
    const identity = d.userId ? ctx.mentions.get(d.userId) : undefined;
    return { name: d.name, identity: identity ?? null };
  });

  const decidersHtml = deciders
    .map((d) =>
      d.identity
        ? `<a href="https://matrix.to/#/${encodeURIComponent(d.identity)}">${escapeHtml(d.name)}</a>`
        : escapeHtml(d.name),
    )
    .join(", ");
  const decidersMarkdown = deciders
    .map((d) =>
      d.identity
        ? `[${escapeMarkdown(d.name)}](https://matrix.to/#/${encodeURIComponent(d.identity)})`
        : escapeMarkdown(d.name),
    )
    .join(", ");

  const html = [
    `<p><strong>${escapeHtml(header)}</strong></p>`,
    `<p>${escapeHtml(subject.statement)}</p>`,
    deciders.length > 0 ? `<p>Deciders: ${decidersHtml}</p>` : "",
    `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>`,
  ]
    .filter(Boolean)
    .join("");

  const markdown = [
    `**${header}**`,
    subject.statement,
    deciders.length > 0 ? `Deciders: ${decidersMarkdown}` : "",
    url,
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    header,
    markdownToPlainText(subject.statement),
    deciders.length > 0 ? `Deciders: ${deciders.map((d) => d.name).join(", ")}` : "",
    url,
  ]
    .filter(Boolean)
    .join("\n");

  // Ping the deciders once, when the decision is published — an open question is
  // theirs to answer. A later transition names them without pinging.
  const mentions =
    event === DECISION_EVENTS.PUBLISHED
      ? deciders.flatMap((d) => (d.identity ? [d.identity] : []))
      : [];

  return { html, text, markdown, mentions };
}

export const decisionProducer: Producer<DecisionSubject> = {
  kind: "decision",

  async load(db: PrismaClient, decisionId: string): Promise<DecisionSubject | null> {
    // Confirmed rows only: a draft is never posted, whatever row got enqueued.
    const row = await db.decision.findFirst({
      where: { id: decisionId, reviewState: "CONFIRMED" },
      select: {
        id: true,
        number: true,
        statement: true,
        status: true,
        workspaceId: true,
        projectId: true,
        workspace: { select: { slug: true } },
        deciders: { select: { userId: true, name: true }, orderBy: { name: "asc" } },
        supersededBy: { select: { number: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      number: row.number,
      statement: row.statement,
      status: row.status,
      workspaceId: row.workspaceId,
      projectId: row.projectId,
      workspaceSlug: row.workspace.slug,
      deciders: row.deciders,
      supersededByNumber: row.supersededBy?.number ?? null,
      mentionUserIds: row.deciders.flatMap((d) => (d.userId ? [d.userId] : [])),
    };
  },

  render: renderDecisionMessage,
};
