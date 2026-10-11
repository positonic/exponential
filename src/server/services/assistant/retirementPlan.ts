/**
 * Who keeps their Assistant when a person holds more than one (ADR-0072).
 *
 * One Assistant per person replaces one per workspace, so a person with
 * Assistants in several workspaces keeps exactly one — the one the chat
 * gateways already pair to — and the rest are retired. This is the survivor
 * rule, pure so it can be tested over the awkward shapes and so the read-only
 * report (`scripts/plan-assistant-retirement.ts`) shows James exactly what the
 * migration will do before he runs it. The migration's SQL implements the same
 * ranking; `20261011200100_retire_duplicate_assistants` cites this function.
 *
 * Ranking, best first — the first three are `findGatewayAssistant`'s, extended
 * so a person always keeps one:
 *  1. a default Assistant in the person's default workspace, still accessible;
 *  2. a default Assistant in any workspace the person can still access;
 *  3. any Assistant in a workspace the person can still access;
 *  4. any Assistant at all (the person left every workspace they made one in).
 * Within a rank the most recently edited wins; the id breaks an exact tie.
 */

export interface RetirementCandidate {
  id: string;
  workspaceId: string;
  isDefault: boolean;
  updatedAt: Date;
  /** The person can still access the Assistant's workspace (direct or team membership). */
  ownerHasAccess: boolean;
}

export interface RetirementPlan {
  survivorId: string;
  /** Every other non-retired Assistant of the person; empty when they hold one. */
  retireIds: string[];
}

function rank(candidate: RetirementCandidate, defaultWorkspaceId: string | null): number {
  if (!candidate.ownerHasAccess) return 4;
  if (!candidate.isDefault) return 3;
  return candidate.workspaceId === defaultWorkspaceId ? 1 : 2;
}

/**
 * `assistants` are one person's non-retired Assistants. Returns null when they
 * have none.
 */
export function planAssistantRetirement(
  assistants: readonly RetirementCandidate[],
  user: { defaultWorkspaceId: string | null },
): RetirementPlan | null {
  if (assistants.length === 0) return null;

  const ordered = [...assistants].sort(
    (a, b) =>
      rank(a, user.defaultWorkspaceId) - rank(b, user.defaultWorkspaceId) ||
      b.updatedAt.getTime() - a.updatedAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const [survivor, ...rest] = ordered;
  return { survivorId: survivor!.id, retireIds: rest.map((a) => a.id) };
}
