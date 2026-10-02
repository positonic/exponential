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
  /** A rewrite holds the draft; nothing can approve or skip it meanwhile. */
  REGENERATING: "REGENERATING",
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

/** The feature a shipped item belongs to: what groups it into a story. */
export interface ShippedFeature {
  id: string;
  name: string;
  description?: string;
  url?: string;
}

/** One piece of work behind a story, e.g. a finished ticket or a milestone. */
export interface ShippedPart {
  title: string;
  detail?: string;
}

/**
 * One thing that shipped in the window, normalised across sources. After
 * `groupIntoStories`, an item is a *story*: one feature (or one stand-alone
 * change) with the pieces of work that shipped for it in `parts`.
 */
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
  /** Set on gathered items that belong to a feature. */
  feature?: ShippedFeature;
  /** Set on stories: the shipped pieces it is made of. */
  parts?: ShippedPart[];
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
  /** Two or three sentences that open the update and tie the week together. */
  intro: string;
  highlights: { itemId: string; title: string; body: string }[];
  /** `title` is the writer's plain-words name for the story; the story's own title otherwise. */
  also: { itemId: string; title?: string; line: string }[];
  /**
   * The model id, or "template" for the deterministic writer, with the reason
   * when it stood in for a model, e.g. "template (Claude failed: …)".
   */
  model: string;
}
