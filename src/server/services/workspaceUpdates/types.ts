/**
 * Shared shapes for **Workspace updates** (CONTEXT.md → Workspace update): the
 * resident copywriter's curated, owner-approved progress post for a period.
 *
 * Pipeline: gather (what shipped in the window) → select (rank + cap, in code)
 * → write (prose for the selection only) → render (Markdown for the draft Page).
 */

export const WORKSPACE_UPDATE_KIND = {
  WEEKLY: "weekly",
  MONTHLY: "monthly",
} as const;
export type WorkspaceUpdateKind =
  (typeof WORKSPACE_UPDATE_KIND)[keyof typeof WORKSPACE_UPDATE_KIND];

export const WORKSPACE_UPDATE_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  SENT: "SENT",
  SKIPPED: "SKIPPED",
  /** Nothing user-facing shipped in the window — no draft, reviewers told. */
  EMPTY: "EMPTY",
} as const;
export type WorkspaceUpdateStatus =
  (typeof WORKSPACE_UPDATE_STATUS)[keyof typeof WORKSPACE_UPDATE_STATUS];

export type ShippedItemSource =
  | "feature"
  | "feature_scope"
  | "cycle"
  | "ticket"
  | "goal_update"
  | "pull_request";

/** One thing that shipped in the window, normalised across sources. */
export interface ShippedItem {
  /** Stable within a run: `${source}:${entityId}`. The writer cites items by it. */
  id: string;
  source: ShippedItemSource;
  title: string;
  /** Optional context the writer may draw on (scope description, achievements…). */
  detail?: string;
  /** Workspace-relative or absolute link for the rendered update. */
  url?: string;
  /** Ranking weight; higher = more newsworthy. 0 = never selected. */
  weight: number;
  /** When it shipped (ISO). Tie-break: most recent first. */
  at: string;
}

/** The ranked, capped selection the writer may mention — its whole universe. */
export interface UpdateSelection {
  highlights: ShippedItem[];
  also: ShippedItem[];
  /** Selectable items beyond the caps, rendered as "+N more". */
  moreCount: number;
}

/** What a writer returns. Every `itemId` must come from the selection. */
export interface WrittenUpdate {
  headline: string;
  tldr: string;
  highlights: { itemId: string; title: string; body: string }[];
  also: { itemId: string; line: string }[];
  /** "template" for the deterministic writer, else the model id. */
  model: string;
}
