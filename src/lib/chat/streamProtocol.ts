/**
 * Pure parser for the /api/chat/stream wire protocol.
 *
 * The stream is plain model text interleaved with two sentinel frame types:
 *
 *  - `__exp_tool__:{...}\n`  — mid-stream structured tool-call events
 *    (phase: call/result/error). Multiple per stream.
 *  - `__exp_meta__:{...}\n`  — a single final frame carrying
 *    `{ interactionId, modelId }`.
 *
 * The parser is cumulative and stateless: feed it the *entire* buffer received
 * so far and it returns what should be rendered right now. Re-parsing the same
 * frames is idempotent, which is what makes a pure function safe here — the
 * caller just calls it again on every chunk. Shared by every surface that
 * consumes the chat stream (the Zoe drawer via ManyChat, the Zoe canvas).
 */

// One agent tool invocation, accumulated from __exp_tool__ frames.
export interface ToolCall {
  id: string;
  name: string;
  args?: Record<string, unknown>;
  status: 'running' | 'success' | 'error';
  errorMsg?: string;
}

export interface ParsedChatStream {
  /**
   * The text to render: the buffer with the meta frame (and anything after
   * it), all complete tool frames, any incomplete trailing tool frame, and
   * keepalive characters removed.
   */
  displayText: string;
  /** Tool calls in first-seen order, each at its latest lifecycle state. */
  toolCalls: ToolCall[];
  /** Set once the meta frame has fully arrived and parsed. */
  interactionId?: string;
}

const META_RE = /\n?__exp_meta__:([^\n]*)\n?/;
// Only fully terminated frames match; an incomplete tail is handled separately.
const TOOL_RE = /\n?__exp_tool__:([^\n]*)\n/g;
const TOOL_PREFIX = '__exp_tool__:';
// Zero-width-space keepalives the server emits on non-text chunks. They reset
// the reader's idle timer but must never appear in rendered text.
const KEEPALIVE_RE = /​/g;

type ToolFramePayload =
  | { phase: 'call'; id: string; name: string; args?: Record<string, unknown> }
  | { phase: 'result'; id: string; name: string }
  | { phase: 'error'; id: string; name: string; msg?: string };

export function parseChatStreamBuffer(buffer: string): ParsedChatStream {
  let displayText = buffer;
  let interactionId: string | undefined;

  // Peel the meta frame (and anything after it) off before rendering so the
  // user never sees the sentinel. A frame whose JSON is still arriving simply
  // fails to parse this pass and succeeds on a later one.
  const metaMatch = META_RE.exec(buffer);
  if (metaMatch) {
    displayText = buffer.slice(0, metaMatch.index);
    try {
      const meta = JSON.parse(metaMatch[1] ?? '') as { interactionId?: string };
      if (meta.interactionId) interactionId = meta.interactionId;
    } catch {
      // Frame split across chunks: try again on the next, fuller buffer.
    }
  }

  // Extract every complete tool frame and fold it into the call map. A
  // `result`/`error` frame inherits `args` from its earlier `call` frame,
  // which necessarily precedes it in the buffer.
  const toolCallsById = new Map<string, ToolCall>();
  displayText = displayText.replace(TOOL_RE, (_match, json: string) => {
    try {
      const payload = JSON.parse(json) as ToolFramePayload;
      if (payload.phase === 'call') {
        toolCallsById.set(payload.id, {
          id: payload.id,
          name: payload.name,
          args: payload.args,
          status: 'running',
        });
      } else if (payload.phase === 'result') {
        const existing = toolCallsById.get(payload.id);
        toolCallsById.set(payload.id, {
          id: payload.id,
          name: payload.name,
          args: existing?.args,
          status: 'success',
        });
      } else {
        const existing = toolCallsById.get(payload.id);
        toolCallsById.set(payload.id, {
          id: payload.id,
          name: payload.name,
          args: existing?.args,
          status: 'error',
          errorMsg: payload.msg,
        });
      }
    } catch {
      // Malformed frame — drop it from the display anyway.
    }
    return '';
  });

  // Hide a partial frame at the tail (e.g. "...__exp_tool__:{partia") so the
  // sentinel doesn't briefly leak into the rendered text.
  const incompleteAt = displayText.lastIndexOf(TOOL_PREFIX);
  if (incompleteAt !== -1 && !displayText.slice(incompleteAt).includes('\n')) {
    displayText = displayText.slice(0, incompleteAt).replace(/\n$/, '');
  }

  displayText = displayText.replace(KEEPALIVE_RE, '');

  return {
    displayText,
    toolCalls: Array.from(toolCallsById.values()),
    interactionId,
  };
}

export type StreamFailureKind = 'transport' | 'idle-timeout' | 'auth' | 'model' | 'unknown';

/**
 * Bucket a thrown stream error into an actionable class. The decisive split is
 * `transport` (the HTTP body was cut mid-flight — a `TypeError`/network drop,
 * the dominant mobile failure) which is safe to auto-retry, vs. everything else
 * (idle stall, auth, model/agent error) which is not.
 */
export function classifyStreamError(error: unknown): { kind: StreamFailureKind; retryable: boolean } {
  if (!(error instanceof Error)) return { kind: 'unknown', retryable: false };
  const text = error.message.toLowerCase();
  if (error.name === 'AbortError' || text.includes('stream-idle-timeout')) {
    return { kind: 'idle-timeout', retryable: true };
  }
  if (text.includes('unauthorized') || text.includes('401') || text.includes('forbidden') || text.includes('403')) {
    return { kind: 'auth', retryable: false };
  }
  if (
    error.name === 'TypeError' ||
    text.includes('network') ||
    text.includes('failed to fetch') ||
    text.includes('load failed') ||
    text.includes('timeout') ||
    text.includes('stream request failed') ||
    text.includes('connection')
  ) {
    return { kind: 'transport', retryable: true };
  }
  if (text.includes('mastra') || text.includes('agent')) {
    return { kind: 'model', retryable: false };
  }
  return { kind: 'unknown', retryable: false };
}
