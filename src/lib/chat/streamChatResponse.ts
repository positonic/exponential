import { parseChatStreamBuffer, type ParsedChatStream } from './streamProtocol';

export interface ChatStreamCoreMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Request body for POST /api/chat/stream. */
export interface ChatStreamPayload {
  messages: ChatStreamCoreMessage[];
  agentId?: string;
  assistantId?: string | null;
  workspaceId?: string | null;
  projectId?: string | null;
  conversationId?: string | null;
  platform: string;
}

export interface ChatStreamUpdate extends ParsedChatStream {
  /**
   * Raw bytes-of-stream seen so far, sentinels included. Callers use this (not
   * displayText) to decide whether a failed turn "had content": tool frames
   * without prose still represent real, non-retryable work.
   */
  rawLength: number;
}

export interface StreamChatOptions {
  /** Called after every chunk with the cumulative parsed state. */
  onUpdate?: (update: ChatStreamUpdate) => void;
  /**
   * Optional external abort (e.g. the Zoe canvas dismiss/navigate rule).
   * Aborting rejects the stream with an AbortError carrying this signal's
   * reason, exactly like the internal idle-timeout abort.
   */
  signal?: AbortSignal;
  /** Abort if no chunk arrives for this long. Default 60s. */
  idleTimeoutMs?: number;
}

const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

/**
 * POST to /api/chat/stream and consume the response incrementally, parsing the
 * wire protocol (see streamProtocol.ts) after every chunk. Resolves with the
 * final parsed state; throws on HTTP failure, transport drop, external abort,
 * or idle timeout (an AbortError whose message includes "stream-idle-timeout",
 * matching what classifyStreamError expects).
 *
 * Deliberately framework-free: surfaces own their React state and call this
 * from wherever they hold it (ManyChat's submit path, the Zoe canvas hook).
 */
export async function streamChatResponse(
  payload: ChatStreamPayload,
  options: StreamChatOptions = {},
): Promise<ChatStreamUpdate> {
  const { onUpdate, signal, idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS } = options;

  // Idle-timeout watchdog: abort if no chunk arrives for idleTimeoutMs.
  // Prevents a stuck-streaming state when the server stream stalls silently.
  const abortController = new AbortController();
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdleTimer = () => {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const resetIdleTimer = () => {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      abortController.abort(new DOMException('stream-idle-timeout', 'AbortError'));
    }, idleTimeoutMs);
  };

  const onExternalAbort = () => {
    abortController.abort(
      signal?.reason ?? new DOMException('stream-aborted', 'AbortError'),
    );
  };
  if (signal) {
    if (signal.aborted) onExternalAbort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    resetIdleTimer();

    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error('Stream request failed');
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let parsed = parseChatStreamBuffer('');

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdleTimer();

        buffer += decoder.decode(value, { stream: true });
        parsed = parseChatStreamBuffer(buffer);
        onUpdate?.({ ...parsed, rawLength: buffer.length });
      }
    }

    return { ...parsed, rawLength: buffer.length };
  } finally {
    clearIdleTimer();
    signal?.removeEventListener('abort', onExternalAbort);
  }
}
