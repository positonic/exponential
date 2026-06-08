/**
 * Shared visual helpers for the roadmap-style dependency graph nodes:
 * a leading emoji per node kind/status and a deterministic pastel colour for
 * assignee pills. Kept free of JSX so it can be imported by any node.
 */

/** Emoji shown at the leading edge of a ticket card, derived from status. */
export function ticketStatusEmoji(status: string): string {
  switch (status) {
    case "DONE":
    case "DEPLOYED":
      return "✅";
    case "ARCHIVED":
      return "📦";
    case "IN_PROGRESS":
      return "🔨";
    case "BLOCKED":
      return "🚫";
    case "QA":
      return "🔍";
    case "READY_TO_PLAN":
    case "COMMITTED":
      return "📌";
    default:
      // BACKLOG / NEEDS_REFINEMENT and any unknown status.
      return "📋";
  }
}

/** Mantine palette used for assignee pills — pastel under `variant="light"`. */
const PILL_COLORS = [
  "green",
  "blue",
  "grape",
  "pink",
  "orange",
  "teal",
  "cyan",
  "indigo",
  "lime",
  "violet",
] as const;

/**
 * Deterministically map a stable key (assignee id) to a Mantine colour so a
 * given person always reads as the same pastel pill across the graph.
 */
export function assigneePillColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PILL_COLORS[hash % PILL_COLORS.length]!;
}

/** Shared card shell — light rounded card with soft shadow, theme-safe. */
export const ROADMAP_CARD_CLASS =
  "rounded-lg border border-border-primary bg-surface-secondary px-3 py-2 shadow-md transition-colors";

export const ROADMAP_CARD_WIDTH = 260;
