import { MastraClient } from '@mastra/client-js';

import type { ChatStreamCoreMessage, ChatStreamUpdate } from './streamChatResponse';
import type { ToolCall } from './streamProtocol';
import { LOCAL_WIKI_AGENT_ID, type WikiClientTool } from '../localWiki';

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

/** Just enough of `@mastra/client-js` to stream a turn — injectable for tests. */
export interface WikiAgentStreamer {
  stream: (
    messages: ChatStreamCoreMessage[],
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
  result?: unknown;
  error?: unknown;
  isError?: boolean;
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

/** Error text for a tool chip, without dumping an object into the UI. */
function errorMessage(payload: ToolCallPayload): string | undefined {
  const raw = payload.error;
  if (typeof raw === 'string') return raw;
  const record = asRecord(raw);
  const message = record?.message;
  return typeof message === 'string' ? message : undefined;
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
  const { onUpdate } = options;

  let displayText = '';
  // Insertion-ordered, keyed by tool call id, so a `result` upgrades the chip
  // the `call` created rather than appending a second one.
  const toolCallsById = new Map<string, ToolCall>();
  // Bytes seen, tool frames included. ManyChat reads this to decide whether a
  // failed turn "had content" — a turn that only ran tools still did real work
  // and must not be silently auto-retried.
  let rawLength = 0;

  const snapshot = (): ChatStreamUpdate => ({
    displayText,
    toolCalls: Array.from(toolCallsById.values()),
    rawLength,
  });

  const response = await agent.stream(messages, { clientTools });

  await response.processDataStream({
    onChunk: (chunk) => {
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
          const id = payload.toolCallId ?? payload.toolName ?? `tool-${toolCallsById.size}`;
          toolCallsById.set(id, {
            id,
            name: payload.toolName ?? 'tool',
            args: payload.args,
            status: 'running',
          });
          rawLength += 1;
          onUpdate?.(snapshot());
          return;
        }
        case 'tool-result': {
          const payload = toolPayload(chunk.payload);
          const id = payload.toolCallId ?? payload.toolName ?? '';
          const existing = toolCallsById.get(id);
          // A result for a call we never saw still deserves a chip; dropping it
          // would hide work that actually touched the user's files.
          const failed = payload.isError === true || payload.error !== undefined;
          toolCallsById.set(id, {
            id,
            name: payload.toolName ?? existing?.name ?? 'tool',
            args: existing?.args,
            status: failed ? 'error' : 'success',
            ...(failed ? { errorMsg: errorMessage(payload) } : {}),
          });
          rawLength += 1;
          onUpdate?.(snapshot());
          return;
        }
        case 'tool-error': {
          const payload = toolPayload(chunk.payload);
          const id = payload.toolCallId ?? payload.toolName ?? '';
          const existing = toolCallsById.get(id);
          toolCallsById.set(id, {
            id,
            name: payload.toolName ?? existing?.name ?? 'tool',
            args: existing?.args,
            status: 'error',
            errorMsg: errorMessage(payload),
          });
          rawLength += 1;
          onUpdate?.(snapshot());
          return;
        }
        case 'error': {
          // A stream-level error ends the turn. Throwing here rather than
          // resolving with half an answer is what lets the caller reuse the
          // existing failure/retry handling.
          const record = asRecord(chunk.payload);
          const nested = asRecord(record?.error);
          const message =
            (typeof nested?.message === 'string' ? nested.message : undefined) ??
            (typeof record?.message === 'string' ? record.message : undefined) ??
            'The local wiki agent stream failed';
          throw new Error(message);
        }
        default:
          // Unrecognised chunk types are not our business.
          return;
      }
    },
  });

  return snapshot();
}
