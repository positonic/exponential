/**
 * What the comment box says when a comment mentioned an Assistant that is not
 * assigned to the Action (decided 2026-10-11): the mention started nothing —
 * assignment is the only thing that starts a run — so offer the assignment.
 * Pure, so the wording is unit-testable without Mantine.
 */
export interface UnstartedAssistantForOffer {
  id: string;
  name: string | null;
}

export interface AssignmentOffer {
  message: string;
  buttonLabel: string;
  userIds: string[];
}

function displayName(name: string | null): string {
  const trimmed = name?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "Your Assistant";
}

/** Null when there is nothing to offer, so the caller shows nothing. */
export function assignmentOffer(
  unstarted: readonly UnstartedAssistantForOffer[],
): AssignmentOffer | null {
  if (unstarted.length === 0) return null;
  const userIds = unstarted.map((a) => a.id);
  if (unstarted.length === 1) {
    const name = displayName(unstarted[0]!.name);
    return {
      message: `${name} isn't assigned to this action, so mentioning it didn't start anything.`,
      buttonLabel: `Assign ${name}`,
      userIds,
    };
  }
  const names = unstarted.map((a) => displayName(a.name));
  const list = `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return {
    message: `${list} aren't assigned to this action, so mentioning them didn't start anything.`,
    buttonLabel: "Assign them",
    userIds,
  };
}
