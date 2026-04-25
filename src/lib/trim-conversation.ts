/**
 * Token-budget-based conversation trimming.
 *
 * Message-count caps (e.g. "keep last 40 messages") don't defend against
 * turns whose tool results are 5k tokens each; input token count grows
 * monotonically per turn until it caps out near the context window.
 *
 * This helper keeps at most `budgetTokens` worth of the most recent
 * messages plus any leading system message. Older turns are dropped —
 * Mastra memory is expected to surface relevant history via semantic
 * recall / lastMessages when the agent actually needs it.
 *
 * Token estimate: 1 token ≈ 4 chars. This is a rough GPT/Claude average;
 * it overshoots on code-heavy text and undershoots on natural language.
 * Good enough for budget enforcement, not for billing.
 */

export interface TrimmableMessage {
  role: string;
  content: string;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface TrimResult<T extends TrimmableMessage> {
  messages: T[];
  droppedCount: number;
  estimatedTokens: number;
}

/**
 * Keep the leading system message (if any) plus as many trailing
 * user/assistant messages as fit inside `budgetTokens`. The last message
 * is always retained even if it alone exceeds the budget, because
 * dropping the current user turn would be useless.
 */
export function trimByTokenBudget<T extends TrimmableMessage>(
  messages: T[],
  budgetTokens: number,
): TrimResult<T> {
  if (messages.length === 0) {
    return { messages: [], droppedCount: 0, estimatedTokens: 0 };
  }

  const leadingSystem = messages[0]?.role === "system" ? messages[0] : undefined;
  const conversationStart = leadingSystem ? 1 : 0;
  const conversation = messages.slice(conversationStart);

  let budgetLeft = budgetTokens;
  if (leadingSystem) budgetLeft -= estimateTokens(leadingSystem.content);

  const kept: T[] = [];
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i]!;
    const cost = estimateTokens(msg.content);
    if (kept.length === 0 || cost <= budgetLeft) {
      kept.unshift(msg);
      budgetLeft -= cost;
    } else {
      break;
    }
  }

  const result = leadingSystem ? [leadingSystem, ...kept] : kept;
  const droppedCount = messages.length - result.length;
  const estimatedTokens = result.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );

  return { messages: result, droppedCount, estimatedTokens };
}
