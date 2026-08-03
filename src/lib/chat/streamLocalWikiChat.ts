import { MastraClient } from '@mastra/client-js';

import type { ChatStreamCoreMessage, ChatStreamUpdate } from './streamChatResponse';
import type { ToolCall } from './streamProtocol';
import { LOCAL_WIKI_AGENT_ID, WIKI_WRITE_TOOLS, type WikiClientTool } from '../localWiki';

/**
 * The local wiki's chat transport: webview → Mastra, directly.
 *
 * Every other chat surface POSTs to `/api/chat/stream` and lets the server talk
 * to Mastra. This one deliberately does not, because the wiki tools have to run
 * on the user's machine: the model asks for a tool, *this page* runs it against
 * the local files, and the turn continues. A server-mediated stream cannot do
 * that — its wire protocol is one-shot — and the detour would also put wiki
 * content through Vercel, which is the thing the feature exists to avoid.
 *
 * What it *does* share is the output shape. `ChatStreamUpdate` is what ManyChat
 * renders, so adapting client-js events into it here means the librarian's
 * bubbles, tool chips and error states look exactly like every other agent's,
 * with no branching in the UI.
 *
 * The client-js side is not a websocket: on a tool call it executes the tool
 * locally, appends the result, and re-POSTs the turn. So a wiki turn is several
 * requests, and `toolCalls` grows across them.
 */

/**
 * How many model↔tool rounds one turn may take before we stop.
 *
 * The tools run on the user's machine, so an agent that keeps calling them is
 * spending their disk and their tokens. Matches the agent's own `maxSteps`.
 */
const MAX_TOOL_ROUNDS = 20;

/**
 * A message in the turn's history.
 *
 * Wider than `ChatStreamCoreMessage` because continuing a turn means sending
 * back the assistant's tool calls and their results, which are structured parts
 * rather than prose.
 */
export type WikiTurnMessage =
  | ChatStreamCoreMessage
  | { role: 'assistant' | 'tool'; content: Record<string, unknown>[] };

/** Just enough of `@mastra/client-js` to stream a turn — injectable for tests. */
export interface WikiAgentStreamer {
  stream: (
    messages: WikiTurnMessage[],
    options: {
      clientTools: Record<string, WikiClientTool>;
    },
  ) => Promise<{
    processDataStream: (handlers: {
      onChunk: (chunk: WikiStreamChunk) => void | Promise<void>;
    }) => Promise<void>;
  }>;
}

/**
 * The client-js chunk shapes we act on. Anything else is ignored rather than
 * failing the turn — the stream format is a moving target on a pinned snapshot
 * build, and an unrecognised chunk should never lose the user their answer.
 */
export interface WikiStreamChunk {
  type?: string;
  payload?: unknown;
}

export interface StreamLocalWikiOptions {
  onUpdate?: (update: ChatStreamUpdate) => void;
  /**
   * Called once at turn end, and only when the turn actually wrote something.
   *
   * This is what makes the wiki's history readable: filing a page, linking it
   * from `index.md` and appending to `log.md` are one change, so they land as
   * one commit. Committing per write would let you revert the page and leave the
   * index pointing at a file that no longer exists.
   */
  onTurnWrote?: (summary: string) => Promise<void>;
  /**
   * Summary for that commit — the user's own message reads better in `git log`
   * than anything we could synthesise.
   */
  turnSummary?: string;
}

/**
 * Point `@mastra/client-js` at the librarian with a freshly minted token.
 *
 * Separated from the streaming logic above so the interesting part — turning
 * client-js events into what ManyChat renders — can be tested without a network
 * or a Mastra build.
 */
export function createLocalWikiStreamer(mastraUrl: string, token: string): WikiAgentStreamer {
  const client = new MastraClient({
    baseUrl: mastraUrl,
    headers: { Authorization: `Bearer ${token}` },
  });
  return client.getAgent(LOCAL_WIKI_AGENT_ID) as unknown as WikiAgentStreamer;
}

interface ToolCallPayload {
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
}

interface TextPayload {
  text?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function toolPayload(payload: unknown): ToolCallPayload {
  return (asRecord(payload) ?? {}) as ToolCallPayload;
}

/**
 * Readable text for something a tool threw. The Rust side rejects with a plain
 * string (`"path is outside the wiki folder"`), so that case matters most.
 */
function thrownMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  const message = asRecord(error)?.message;
  return typeof message === 'string' ? message : 'The wiki tool failed';
}

/**
 * Stream one turn to the librarian, executing wiki tools on this device.
 *
 * Resolves with the final state; throws if the stream itself fails, so callers
 * can reuse `classifyStreamError` and the existing retry handling.
 */
export async function streamLocalWikiChat(
  agent: WikiAgentStreamer,
  messages: ChatStreamCoreMessage[],
  clientTools: Record<string, WikiClientTool>,
  options: StreamLocalWikiOptions = {},
): Promise<ChatStreamUpdate> {
  const { onUpdate, onTurnWrote, turnSummary } = options;

  // Set the moment a write tool *succeeds*, not when it is called: a write that
  // failed the path jail changed nothing, and committing for it would produce an
  // empty commit that implies otherwise.
  let wroteSomething = false;
  let displayText = '';
  // Insertion-ordered, keyed by tool call id, so a `result` upgrades the chip
  // the `call` created rather than appending a second one.
  const toolCallsById = new Map<string, ToolCall>();
  // Bytes seen, tool frames included. ManyChat reads this to decide whether a
  // failed turn "had content" — a turn that only ran tools still did real work
  // and must not be silently auto-retried.
  let rawLength = 0;
  // A stream-level error is recorded rather than thrown from inside `onChunk`,
  // then re-thrown once the stream is done.
  //
  // Throwing from the callback does work against the pinned client-js build —
  // it awaits `onChunk` inside a `try`/`finally`, not a `try`/`catch`, so the
  // rejection propagates. But that is an internal of an OM snapshot build we
  // pin precisely because it moves, and if a future version ever caught and
  // logged instead, a failed turn would silently resolve as a partial answer.
  // Recording it costs nothing and cannot regress that way.
  //
  // Held in an object rather than a bare `let` so TypeScript doesn't narrow it
  // to `never` — it can't see that the callback below assigns to it.
  const failure: { error?: Error } = {};

  const snapshot = (): ChatStreamUpdate => ({
    displayText,
    toolCalls: Array.from(toolCallsById.values()),
    rawLength,
  });

  // Tool schemas only — no `execute`.
  //
  // Handing client-js an executable tool makes it drive the continuation itself,
  // and on this build that continuation re-POSTs only the messages accumulated
  // during the stream: the user's own message is dropped. The model gets a tool
  // result with no idea what was asked, and answers by introducing itself. So we
  // declare the contract to the server and run the loop below ourselves, which
  // is also the honest shape — the tools are ours, executing on this device.
  const declaredTools = Object.fromEntries(
    Object.entries(clientTools).map(([name, { execute: _execute, ...schema }]) => [name, schema]),
  ) as Record<string, WikiClientTool>;

  // A turn is a conversation, not a request. Bounded so a model that keeps
  // calling tools cannot spin forever on the user's machine.
  const history: WikiTurnMessage[] = [...messages];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const pending: { id: string; name: string; args: Record<string, unknown> }[] = [];

    const response = await agent.stream(history, { clientTools: declaredTools });
    await response.processDataStream({
      onChunk: (chunk) => {
        if (failure.error) return;

        switch (chunk.type) {
          case 'text-delta': {
            const text = (asRecord(chunk.payload) as TextPayload | null)?.text;
            if (typeof text === 'string' && text) {
              displayText += text;
              rawLength += text.length;
              onUpdate?.(snapshot());
            }
            return;
          }
          case 'tool-call': {
            const payload = toolPayload(chunk.payload);
            const name = payload.toolName ?? 'tool';
            const id = payload.toolCallId ?? `${name}-${toolCallsById.size}`;
            const args = payload.args ?? {};
            pending.push({ id, name, args });
            toolCallsById.set(id, { id, name, args, status: 'running' });
            rawLength += 1;
            onUpdate?.(snapshot());
            return;
          }
          case 'error': {
            // Ends the turn. Surfacing it as a rejection rather than resolving
            // with half an answer is what lets the caller reuse the existing
            // failure/retry handling.
            const record = asRecord(chunk.payload);
            const nested = asRecord(record?.error);
            failure.error = new Error(
              (typeof nested?.message === 'string' ? nested.message : undefined) ??
                (typeof record?.message === 'string' ? record.message : undefined) ??
                'The local wiki agent stream failed',
            );
            return;
          }
          default:
            // Unrecognised chunk types are not our business.
            return;
        }
      },
    });

    if (failure.error) break;
    // No tools asked for: the model has said its piece and the turn is done.
    if (pending.length === 0) return await finish();

    // Run them here, on this device, and fold the outcome in ourselves. The
    // stream carries no `tool-result` event on this build — the result reaches
    // the model only by going back up in the next request — so our own call is
    // the single source of truth for whether a tool ran and what it returned.
    const results: WikiTurnMessage[] = [];
    for (const call of pending) {
      let result: unknown;
      let failed: unknown;
      try {
        result = await clientTools[call.name]?.execute(call.args);
        if (WIKI_WRITE_TOOLS.has(call.name)) wroteSomething = true;
      } catch (error) {
        failed = error;
        // The model is told, so it can apologise or try a different path rather
        // than pretending the write happened.
        result = { error: thrownMessage(error) };
      }
      toolCallsById.set(call.id, {
        id: call.id,
        name: call.name,
        args: call.args,
        status: failed ? 'error' : 'success',
        ...(failed ? { errorMsg: thrownMessage(failed) } : {}),
      });
      rawLength += 1;
      onUpdate?.(snapshot());

      results.push({
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: call.id, toolName: call.name, result },
        ],
      });
    }

    // Carry the whole conversation forward — crucially including the user's
    // original message, which is exactly what the library's own continuation
    // loses.
    history.push({
      role: 'assistant',
      content: pending.map((call) => ({
        type: 'tool-call',
        toolCallId: call.id,
        toolName: call.name,
        args: call.args,
      })),
    });
    history.push(...results);
  }

  return finish();

  /**
   * End the turn: surface any stream failure, then commit once if it wrote.
   *
   * Committing here rather than per write is what makes the history readable —
   * filing a page, linking it from `index.md` and appending to `log.md` are one
   * change, and splitting them would let you revert the page while leaving the
   * index pointing at a file that no longer exists.
   */
  async function finish(): Promise<ChatStreamUpdate> {
    if (failure.error) throw failure.error;
    if (wroteSomething && onTurnWrote) {
      await onTurnWrote(turnSummary?.trim() ?? '');
    }
    return snapshot();
  }
}
