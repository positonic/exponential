/**
 * Render an ADR markdown file from a Decision (ADR-0060, V3).
 *
 * This produces a *draft file* for a human to put in a repository — nothing
 * here writes ADR content anywhere. Git stays the source of truth: the
 * Decision Log projects ADR files into `AdrDocument` rows and never the other
 * way round, and that constraint holds whether the file reaches the repo
 * through a pull request Exponential opens or one a person opens by hand.
 *
 * The output is shaped to survive the round trip through `adrSync/parser.ts`:
 * a leading `#` title, a `## Status` section whose first line the parser
 * reads, and a `NNNN-slug.md` filename it can take a number from.
 */
import type { DecisionStatus } from "@prisma/client";

/** ADR status words the sync parser maps back (`mapStatus` anchors on these). */
const STATUS_WORD: Record<DecisionStatus, string> = {
  OPEN: "Proposed",
  PROPOSED: "Proposed",
  ACCEPTED: "Accepted",
  SUPERSEDED: "Superseded",
  DEPRECATED: "Deprecated",
};

export interface AdrDraftDecision {
  number: number;
  statement: string;
  /** Markdown with ADR headings, as stored on the decision. */
  body: string | null;
  status: DecisionStatus;
  decidedAt: Date | null;
  deciderNames: string[];
  meetingTitle?: string | null;
  meetingDate?: Date | null;
}

export interface AdrDraft {
  /** Repo-relative path, e.g. `docs/adr/0061-ceremony-definitions.md`. */
  path: string;
  filename: string;
  markdown: string;
  /** The number the filename claims; shown so a collision is obvious. */
  number: number;
}

/** Filename slug: lowercase words from the statement, capped so paths stay sane. */
export function adrSlug(statement: string): string {
  const slug = statement
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .reduce<string[]>((words, word) => {
      if (word.length === 0) return words;
      const candidate = [...words, word].join("-");
      return candidate.length > 60 ? words : [...words, word];
    }, [])
    .join("-");
  return slug.length > 0 ? slug : "decision";
}

const ISO_DAY = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Split a decision body into its `##` sections. A body with no headings is
 * one unnamed block — manual decisions are often a paragraph, and dropping
 * that text because it lacked a heading would lose the whole rationale.
 */
export function splitBodySections(body: string | null): {
  intro: string;
  sections: Array<{ heading: string; content: string }>;
} {
  if (!body?.trim()) return { intro: "", sections: [] };
  const lines = body.split("\n");
  const sections: Array<{ heading: string; content: string }> = [];
  const introLines: string[] = [];
  let current: { heading: string; content: string[] } | null = null;
  for (const line of lines) {
    const match = /^#{2,}\s+(.+?)\s*$/.exec(line);
    if (match?.[1]) {
      if (current) sections.push({ heading: current.heading, content: current.content.join("\n").trim() });
      current = { heading: match[1], content: [] };
      continue;
    }
    if (current) current.content.push(line);
    else introLines.push(line);
  }
  if (current) sections.push({ heading: current.heading, content: current.content.join("\n").trim() });
  return { intro: introLines.join("\n").trim(), sections };
}

const matches = (heading: string, ...words: string[]) =>
  words.some((w) => heading.toLowerCase().includes(w));

export function renderAdrMarkdown(decision: AdrDraftDecision): string {
  const { intro, sections } = splitBodySections(decision.body);
  const context = sections.find((s) => matches(s.heading, "context"));
  const alternatives = sections.find((s) => matches(s.heading, "alternative", "option"));
  const consequences = sections.find((s) => matches(s.heading, "consequence", "trade-off", "tradeoff"));
  const named = new Set([context, alternatives, consequences].filter(Boolean));
  const rest = sections.filter((s) => !named.has(s));

  const statusLine = `${STATUS_WORD[decision.status]}${
    decision.decidedAt ? ` — ${ISO_DAY(decision.decidedAt)}` : ""
  }`;

  const out: string[] = [`# ${decision.statement}`, "", "## Status", "", statusLine];

  // Context first, as the house ADRs do. A body with no headings becomes the
  // context: it is the reasoning, whatever the author called it.
  const contextBody = context?.content ?? (sections.length === 0 ? intro : "");
  if (contextBody) out.push("", "## Context", "", contextBody);

  out.push("", "## Decision", "", decision.statement);
  if (decision.deciderNames.length > 0) {
    out.push("", `Decided by ${formatList(decision.deciderNames)}.`);
  }

  if (alternatives?.content) out.push("", "## Alternatives considered", "", alternatives.content);
  if (consequences?.content) out.push("", "## Consequences", "", consequences.content);
  for (const section of rest) {
    if (section.content) out.push("", `## ${section.heading}`, "", section.content);
  }
  // Intro text is kept when it wasn't already used as the context, so no
  // authored prose is silently dropped on the way into the file.
  if (intro && sections.length > 0) out.push("", "## Notes", "", intro);

  out.push("", "---", "", provenanceLine(decision));
  return out.join("\n") + "\n";
}

function provenanceLine(decision: AdrDraftDecision): string {
  const label = `D-${String(decision.number).padStart(4, "0")}`;
  if (decision.meetingTitle) {
    const when = decision.meetingDate ? ` on ${ISO_DAY(decision.meetingDate)}` : "";
    return `Drafted from Exponential decision ${label}, recorded in "${decision.meetingTitle}"${when}.`;
  }
  return `Drafted from Exponential decision ${label}.`;
}

function formatList(names: string[]): string {
  if (names.length === 1) return names[0]!;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;
}

export function buildAdrDraft(
  decision: AdrDraftDecision,
  opts: { nextNumber: number; adrPath: string },
): AdrDraft {
  const filename = `${String(opts.nextNumber).padStart(4, "0")}-${adrSlug(decision.statement)}.md`;
  const dir = opts.adrPath.replace(/\/+$/, "");
  return {
    path: dir ? `${dir}/${filename}` : filename,
    filename,
    number: opts.nextNumber,
    markdown: renderAdrMarkdown(decision),
  };
}
