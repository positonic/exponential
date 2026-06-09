/**
 * Render-hint registry for the workspace activity feed.
 *
 * Each entry maps an `(entityType, action)` pair to a sentence template and
 * an icon kind. The component looks up the hint at render time so adding a
 * new event source (e.g. `goal`/`completed`) is a one-line addition here —
 * no component edits required.
 *
 * Template tokens:
 *   {actor}      — the user's name (or "Someone" when null/missing)
 *   {entityRef}  — a short label derived from the event metadata (entity
 *                  title, snippet, etc). Renders as a plain string; the
 *                  component decides whether to wrap it in a link.
 */

export type IconKind =
  | "created"
  | "updated"
  | "status_changed"
  | "completed"
  | "commented"
  | "milestone"
  | "fallback";

export interface FeedRenderHint {
  /** Sentence template with `{actor}` and `{entityRef}` placeholders. */
  template: string;
  /** Visual icon kind, mapped to a colored chip in the component. */
  iconKind: IconKind;
}

/** Lookup key for a render hint. */
function key(entityType: string, action: string): string {
  return `${entityType}:${action}`;
}

const HINTS: Record<string, FeedRenderHint> = {
  // Actions
  [key("action", "created")]: {
    template: "{actor} created action {entityRef}",
    iconKind: "created",
  },
  [key("action", "updated")]: {
    template: "{actor} updated action {entityRef}",
    iconKind: "updated",
  },
  [key("action", "status_changed")]: {
    template: "{actor} changed status on action {entityRef}",
    iconKind: "status_changed",
  },
  [key("action", "completed")]: {
    template: "{actor} completed action {entityRef}",
    iconKind: "completed",
  },

  // Action comments
  [key("action_comment", "created")]: {
    template: "{actor} commented on action {entityRef}",
    iconKind: "commented",
  },

  // Tickets
  [key("ticket", "created")]: {
    template: "{actor} created ticket {entityRef}",
    iconKind: "created",
  },
  [key("ticket", "updated")]: {
    template: "{actor} updated ticket {entityRef}",
    iconKind: "updated",
  },
  [key("ticket", "status_changed")]: {
    template: "{actor} changed status on ticket {entityRef}",
    iconKind: "status_changed",
  },
  [key("ticket", "completed")]: {
    template: "{actor} completed ticket {entityRef}",
    iconKind: "completed",
  },

  // Ticket comments
  [key("ticket_comment", "created")]: {
    template: "{actor} commented on ticket {entityRef}",
    iconKind: "commented",
  },

  // Projects — completing a project is a milestone, so it gets the emphasized
  // "milestone" icon kind (trophy + filled chip) to stand out from task churn.
  [key("project", "completed")]: {
    template: "{actor} completed project {entityRef}",
    iconKind: "milestone",
  },
};

/** Default hint used when no entry exists for the (entityType, action) pair. */
const FALLBACK: FeedRenderHint = {
  template: "{actor} touched {entityRef}",
  iconKind: "fallback",
};

/**
 * Resolve a render hint for the given event. Falls back to a neutral
 * "touched" sentence + a generic icon if the registry has no entry yet,
 * so the feed never renders a blank row when a new event source is added
 * without a registry update.
 */
export function resolveFeedHint(
  entityType: string,
  action: string,
): FeedRenderHint {
  return HINTS[key(entityType, action)] ?? FALLBACK;
}

/**
 * Extract a human-readable reference for the event's entity from its
 * metadata payload. Hierarchy: name → title → snippet → entityId.
 */
export function describeEntityRef(
  entityId: string,
  metadata: unknown,
): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const m = metadata as Record<string, unknown>;
    if (typeof m.name === "string" && m.name.trim().length > 0) return m.name;
    if (typeof m.title === "string" && m.title.trim().length > 0) return m.title;
    if (typeof m.snippet === "string" && m.snippet.trim().length > 0) {
      return m.snippet;
    }
  }
  return entityId.slice(0, 8); // short hash-like fallback
}
