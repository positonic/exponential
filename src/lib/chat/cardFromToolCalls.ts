import type { ToolCall } from "./streamProtocol";

/**
 * Interactive card to attach to an assistant turn, derived from the tools it
 * ran. Mirror of the `card` arm on `ChatMessage` in AgentModalProvider — kept
 * as its own type so this module doesn't depend on the provider (and the
 * provider's union can widen without touching this).
 */
export type ToolCard = { kind: "draft-features"; transcriptionId: string };

/**
 * The mastra tool id whose successful call renders the draft-features review
 * card in chat. It is the conversational (V2) entry point to the same ideation
 * path the meeting-page button uses — the tool writes only DRAFT rows, and this
 * card is where the human accepts them. The id is a cross-repo contract with
 * `../mastra`'s `feature-ideation-tools.ts`; changing it silently drops the
 * card.
 */
const IDEATE_FEATURES_TOOL_ID = "ideate-features";

function readTranscriptionId(args: Record<string, unknown> | undefined): string | null {
  const raw = args?.transcriptionId;
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Given the tool calls a chat turn produced, return the card to render beneath
 * it, or null. Only a *successful* `ideate-features` call qualifies — a failed
 * one (no access, no transcript) must not leave an empty card promising drafts
 * that were never written. The last successful call wins, so a turn that
 * re-ideates points the card at the most recent meeting.
 */
export function cardFromToolCalls(toolCalls: ToolCall[]): ToolCard | null {
  for (let i = toolCalls.length - 1; i >= 0; i--) {
    const call = toolCalls[i];
    if (
      call &&
      call.name === IDEATE_FEATURES_TOOL_ID &&
      call.status === "success"
    ) {
      const transcriptionId = readTranscriptionId(call.args);
      if (transcriptionId) {
        return { kind: "draft-features", transcriptionId };
      }
    }
  }
  return null;
}
