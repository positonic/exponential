/**
 * The toast a create surface shows when the create response says an Agent
 * run started (ADR-0067): "<Assistant> is on it". Pure, so the two create
 * modals share one rule and it is unit-testable without Mantine.
 */
export interface CreatedActionForToast {
  name: string;
  agentRunsQueued: number;
  assignees: Array<{ user: { name: string | null; isAgent: boolean } }>;
}

export interface AssistantOnItToast {
  title: string;
  message: string;
}

/**
 * Null when no run started, so the caller shows nothing (a human assignee,
 * a parked action, a run already live: the server reported 0). The name is
 * the first agent-principal assignee's, and an Assistant with no display
 * name is still "Your Assistant". Accepted edge: the response does not say
 * which agent got the run, so a create that attaches a plain External agent
 * ahead of an Assistant names the former; nothing a create modal does today
 * produces that pair.
 */
export function assistantOnItToast(
  created: CreatedActionForToast,
): AssistantOnItToast | null {
  if (created.agentRunsQueued <= 0) return null;
  const agent = created.assignees.find((a) => a.user.isAgent);
  const who = agent?.user.name?.trim() ? agent.user.name : "Your Assistant";
  return { title: `${who} is on it`, message: `Working on "${created.name}"` };
}
