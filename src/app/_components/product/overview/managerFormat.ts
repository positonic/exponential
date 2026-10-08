import type { RouterOutputs } from "~/trpc/react";

export type ManagerOverviewData =
  RouterOutputs["product"]["product"]["getManagerOverview"];
export type StageKey = ManagerOverviewData["stages"][number]["key"];
export type AtRiskItem = ManagerOverviewData["atRisk"][number];
export type PathNode = ManagerOverviewData["criticalPath"][number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "1d 4h", "9h", "38m". */
export function formatDuration(ms: number): string {
  if (ms < HOUR) return `${Math.max(1, Math.round(ms / MINUTE))}m`;
  if (ms < DAY) return `${Math.round(ms / HOUR)}h`;
  const days = Math.floor(ms / DAY);
  const hours = Math.round((ms - days * DAY) / HOUR);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function formatDay(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const STAGE_LABEL: Record<StageKey, string> = {
  committed: "Committed",
  inProgress: "In progress",
  inReview: "In review",
  done: "Done",
  deployed: "Deployed",
};

/** Noun used in the bottleneck callout ("Review is the bottleneck"). */
export const STAGE_NOUN: Partial<Record<StageKey, string>> = {
  inProgress: "Building",
  inReview: "Review",
};

/** Ticket age bucket for the stage-tile dots. */
export function ageBucket(ms: number): "fresh" | "aging" | "old" {
  if (ms < DAY) return "fresh";
  if (ms <= 3 * DAY) return "aging";
  return "old";
}

export function riskLabel(item: AtRiskItem): string {
  switch (item.reason.kind) {
    case "blocked":
      return item.reason.by ? `Blocked by ${item.reason.by}` : "Blocked";
    case "slipping":
      return `Slipping · due ${formatDay(item.reason.due)}`;
    case "noReview":
      return `No review ${formatDuration(item.reason.ageMs)}`;
    case "unassigned":
      return "Unassigned";
  }
}

export function pathStatusLine(node: PathNode): string {
  if (node.kind === "blocked") {
    return node.prevDisplayId ? `Blocked until ${node.prevDisplayId} is done` : "Blocked";
  }
  if (node.kind === "active") {
    const stage = node.status === "QA" ? "In QA" : "In progress";
    return node.assigneeName ? `${stage} · ${node.assigneeName}` : stage;
  }
  return node.prevDisplayId ? `Waiting on ${node.prevDisplayId}` : "Not started";
}

export interface AiSummary {
  summary: string;
  risk: string | null;
}

/** Splits "a **b** c" into text and bold parts (the AI marks names in bold). */
export function splitBold(text: string): { text: string; bold: boolean }[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part) =>
      part.startsWith("**") && part.endsWith("**")
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}

export function buildMarkdown(
  data: ManagerOverviewData,
  productName: string,
  ai: AiSummary | null,
): string {
  const lines = [`## ${productName} overview`];
  if (ai) {
    lines.push("", ai.summary);
    if (ai.risk) lines.push("", `**One risk:** ${ai.risk}`);
  }
  if (data.atRisk.length) {
    lines.push("", "### At risk this cycle");
    for (const r of data.atRisk) lines.push(`- ${r.displayId} ${r.title} - ${riskLabel(r)}`);
  }
  if (data.criticalPath.length) {
    lines.push("", "### Critical path");
    data.criticalPath.forEach((n, i) =>
      lines.push(`${i + 1}. ${n.displayId} ${n.title} - ${pathStatusLine(n)}`),
    );
  }
  return lines.join("\n");
}
