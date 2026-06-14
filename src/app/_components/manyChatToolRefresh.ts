/**
 * Maps an agent tool name to whether it should trigger a refresh of the goal
 * (Objective) activity feed.
 *
 * Why this exists as a tiny pure function: the tool name that reaches the client
 * is brittle — the chat stream emits the registered key (`addObjectiveUpdateTool`),
 * the tool's createTool id is `add-objective-update`, and the UI humanizes it to
 * "Add objective update". The string we match on can drift, so the matching is the
 * part most likely to be wrong. Keeping it pure makes it directly unit-testable
 * (test the layer that can actually break, not the React glue around it).
 *
 * Normalizing to lowercase letters only makes the match hold across all three
 * forms above.
 */
export function toolTriggersGoalActivityRefresh(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/[^a-z]/g, "");
  return (
    normalized.includes("objectivecomment") ||
    normalized.includes("objectiveupdate")
  );
}
