/**
 * Agent-write → client query-invalidation rule registry.
 *
 * When the in-app assistant (Zoe, via the ManyChat stream) mutates data, the
 * affected views render in sibling components with their own React Query caches,
 * so they stay stale until reload. This module is the pure, unit-testable core
 * that decides — from the names of the tools the agent just ran — which entities
 * the chat component should invalidate. ManyChat owns the actual `utils.*.invalidate()`
 * wiring; this module owns only the matching (the part most likely to drift).
 *
 * The tool name that reaches the client is brittle: the chat stream emits the
 * registered key (`addObjectiveUpdateTool`), the tool's createTool id is
 * `add-objective-update`, and the UI humanizes it to "Add objective update".
 * Normalizing to lowercase letters only makes a match hold across all three forms.
 *
 * Adding a future entity = one matcher + one rule (+ its unit test). See ADR-0023.
 */

/** Entities whose mounted views ManyChat knows how to refresh after an agent write. */
export type RefreshEntity = "goalActivity" | "action";

/** Lowercase, letters-only — collapses registration-key / createTool-id / humanized forms. */
function normalize(toolName: string): string {
  return toolName.toLowerCase().replace(/[^a-z]/g, "");
}

/**
 * Whether a tool name should refresh the goal (Objective) activity feed.
 * Kept as a named export (not just an inline rule) because its unit test is the
 * template the other matchers mirror.
 */
export function toolTriggersGoalActivityRefresh(toolName: string): boolean {
  const normalized = normalize(toolName);
  return (
    normalized.includes("objectivecomment") ||
    normalized.includes("objectiveupdate")
  );
}

/**
 * Whether a tool name is an Action-mutating tool. Recognises the five variants —
 * create-action, quick-create-action, create-project-action, update-action,
 * delete-action — across all name forms, by requiring both the `action` noun and
 * a mutating verb. Read tools (`get-all-actions`) lack a verb; goal-activity tools
 * (`add-objective-update`) lack the `action` noun, so neither matches.
 */
export function toolTriggersActionRefresh(toolName: string): boolean {
  const normalized = normalize(toolName);
  if (!normalized.includes("action")) return false;
  return (
    normalized.includes("create") ||
    normalized.includes("update") ||
    normalized.includes("delete") ||
    normalized.includes("move")
  );
}

interface RefreshRule {
  entity: RefreshEntity;
  matches: (toolName: string) => boolean;
  /**
   * If set, the rule only applies when the chat is on this page type. The goal
   * feed is a sibling component that is only mounted on goal pages, so guarding
   * it avoids needless invalidation elsewhere. `action` has no guard — Actions
   * surface on many pages and invalidation only refetches mounted observers, so
   * firing unconditionally is near-free.
   */
  requiresPageType?: string;
}

const RULES: RefreshRule[] = [
  {
    entity: "goalActivity",
    matches: toolTriggersGoalActivityRefresh,
    requiresPageType: "goal",
  },
  {
    entity: "action",
    matches: toolTriggersActionRefresh,
  },
];

/**
 * Given the names of the tools the agent successfully ran (and the current page
 * type), return the set of entities whose mounted views should be invalidated.
 */
export function entitiesToRefresh(
  toolNames: string[],
  pageType?: string,
): Set<RefreshEntity> {
  const result = new Set<RefreshEntity>();
  for (const rule of RULES) {
    if (rule.requiresPageType && rule.requiresPageType !== pageType) continue;
    if (toolNames.some(rule.matches)) result.add(rule.entity);
  }
  return result;
}
