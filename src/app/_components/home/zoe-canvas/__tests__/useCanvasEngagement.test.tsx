/**
 * Engagement-lifecycle tests for the Zoe canvas hook (ADR-0040).
 *
 * Rendered against the REAL AgentModalProvider (the canvas is a display mode
 * of that shared conversation state — provider semantics are the thing under
 * test), with the tRPC layer and the stream transport mocked (mirrors
 * useFavorite.test.ts). Covers: fresh conversationId per engagement,
 * follow-up continuity, dismiss-ends-engagement, abort-on-dismiss marking
 * the in-flight turn `incomplete`, and the drawer⇄canvas collision rules
 * (handoff keeps the thread, chip-with-drawer-open closes the drawer,
 * navigate-away aborts).
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import { act, render, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import type {
  ChatStreamPayload,
  ChatStreamUpdate,
  StreamChatOptions,
} from '~/lib/chat/streamChatResponse';

const { mockStartConversation, mockStreamChatResponse, streamCalls } = vi.hoisted(() => {
  const streamCalls: { payload: ChatStreamPayload; options: StreamChatOptions }[] = [];
  return {
    mockStartConversation: vi.fn(),
    mockStreamChatResponse: vi.fn(),
    streamCalls,
  };
});

vi.mock('~/trpc/react', () => ({
  api: {
    useUtils: () => ({}),
    aiInteraction: {
      startConversation: {
        useMutation: () => ({ mutateAsync: mockStartConversation }),
      },
    },
    assistant: {
      getDefault: { useQuery: () => ({ data: undefined }) },
    },
    mastra: {
      getMastraAgents: {
        useQuery: () => ({ data: [{ id: 'zoeAgent', name: 'Zoe' }] }),
      },
    },
  },
}));

vi.mock('~/lib/chat/streamChatResponse', () => ({
  streamChatResponse: mockStreamChatResponse,
}));

vi.mock('~/app/_components/agent/toolRefreshInvalidation', () => ({
  applyToolRefreshInvalidations: vi.fn(),
}));

import { AgentModalProvider, useAgentModal } from '~/providers/AgentModalProvider';
import { useCanvasEngagement, type CanvasEngagement } from '../useCanvasEngagement';

function wrapper({ children }: PropsWithChildren) {
  return <AgentModalProvider>{children}</AgentModalProvider>;
}

function completedStream(update: Partial<ChatStreamUpdate> = {}): ChatStreamUpdate {
  return {
    displayText: 'Here is your standup.',
    toolCalls: [],
    interactionId: 'int-1',
    rawLength: 21,
    ...update,
  };
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  streamCalls.length = 0;
  let mintCount = 0;
  mockStartConversation.mockReset();
  mockStartConversation.mockImplementation(async () => ({
    conversationId: `conv-${++mintCount}`,
  }));
  mockStreamChatResponse.mockReset();
  mockStreamChatResponse.mockImplementation(
    async (payload: ChatStreamPayload, options: StreamChatOptions) => {
      streamCalls.push({ payload, options });
      const final = completedStream();
      // The real transport calls onUpdate with the cumulative parsed state on
      // every chunk before resolving with the same final state.
      options.onUpdate?.({
        displayText: final.displayText,
        toolCalls: final.toolCalls,
        rawLength: final.rawLength,
      });
      return final;
    },
  );
});

function hangingStream() {
  mockStreamChatResponse.mockImplementation(
    (payload: ChatStreamPayload, options: StreamChatOptions) => {
      streamCalls.push({ payload, options });
      return new Promise<ChatStreamUpdate>((_resolve, reject) => {
        // A partial answer streams, then the stream hangs until aborted.
        options.onUpdate?.({
          displayText: 'Partial…',
          toolCalls: [],
          rawLength: 8,
        });
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('canvas-dismissed', 'AbortError'));
        });
      });
    },
  );
}

describe('useCanvasEngagement', () => {
  test('opening an engagement mints a fresh conversationId and streams on it', async () => {
    const { result } = renderHook(() => useCanvasEngagement({ workspaceId: 'ws-1' }), {
      wrapper,
    });

    act(() => result.current.send('Standup on my projects'));
    expect(result.current.engaged).toBe(true);
    await flush();

    expect(mockStartConversation).toHaveBeenCalledTimes(1);
    expect(result.current.conversationId).toBe('conv-1');
    expect(streamCalls[0]?.payload.conversationId).toBe('conv-1');

    // The engagement transcript: the echoed question + the streamed answer.
    const visible = result.current.messages.filter((m) => m.type !== 'system');
    expect(visible).toHaveLength(2);
    expect(visible[0]).toMatchObject({ type: 'human', content: 'Standup on my projects' });
    expect(visible[1]).toMatchObject({
      type: 'ai',
      content: 'Here is your standup.',
      interactionId: 'int-1',
    });
  });

  test('follow-ups stay on the engagement thread (no second mint)', async () => {
    const { result } = renderHook(() => useCanvasEngagement({ workspaceId: 'ws-1' }), {
      wrapper,
    });

    act(() => result.current.send('First ask'));
    await flush();
    act(() => result.current.send('Follow-up'));
    await flush();

    expect(mockStartConversation).toHaveBeenCalledTimes(1);
    expect(streamCalls).toHaveLength(2);
    expect(streamCalls[1]?.payload.conversationId).toBe('conv-1');
    // The follow-up request carries the first exchange as history.
    const roles = streamCalls[1]?.payload.messages.map((m) => m.role);
    expect(roles).toContain('assistant');
    expect(streamCalls[1]?.payload.messages.at(-1)).toMatchObject({
      role: 'user',
      content: 'Follow-up',
    });

    const visible = result.current.messages.filter((m) => m.type !== 'system');
    expect(visible.map((m) => m.type)).toEqual(['human', 'ai', 'human', 'ai']);
  });

  test('dismissal ends the engagement; the next send starts a fresh Thread', async () => {
    const { result } = renderHook(() => useCanvasEngagement({ workspaceId: 'ws-1' }), {
      wrapper,
    });

    act(() => result.current.send('First engagement'));
    await flush();
    act(() => result.current.dismiss());
    expect(result.current.engaged).toBe(false);
    // The finished thread stays the active conversation for the drawer.
    expect(result.current.conversationId).toBe('conv-1');

    act(() => result.current.send('Second engagement'));
    await flush();

    expect(result.current.engaged).toBe(true);
    expect(mockStartConversation).toHaveBeenCalledTimes(2);
    expect(result.current.conversationId).toBe('conv-2');
    expect(streamCalls[1]?.payload.conversationId).toBe('conv-2');

    // The canvas transcript was reset — only the new engagement's turns.
    const visible = result.current.messages.filter((m) => m.type !== 'system');
    expect(visible).toHaveLength(2);
    expect(visible[0]).toMatchObject({ type: 'human', content: 'Second engagement' });
  });

  test('dismissing mid-stream aborts and marks the turn incomplete with Retry', async () => {
    hangingStream();

    const { result } = renderHook(() => useCanvasEngagement({ workspaceId: 'ws-1' }), {
      wrapper,
    });

    act(() => result.current.send('Long question'));
    await flush();
    expect(result.current.isStreaming).toBe(true);

    act(() => result.current.dismiss());
    await flush();

    expect(result.current.engaged).toBe(false);
    expect(result.current.isStreaming).toBe(false);

    const last = result.current.messages.at(-1);
    expect(last?.type).toBe('ai');
    // Partial answer kept, turn finalized as incomplete with Retry available.
    expect(last?.content).toBe('Partial…');
    expect(last?.failure).toMatchObject({
      severity: 'incomplete',
      canRetry: true,
      retryText: 'Long question',
    });
  });

  test('handoff: drawer opening mid-engagement dismisses the canvas and keeps the thread', async () => {
    const { result } = renderHook(
      () => ({ canvas: useCanvasEngagement({ workspaceId: 'ws-1' }), modal: useAgentModal() }),
      { wrapper },
    );

    act(() => result.current.canvas.send('Standup on my projects'));
    await flush();
    const turnsBefore = result.current.canvas.messages.filter((m) => m.type !== 'system');

    // ⌘J / FAB — the drawer opens: the "continue in panel" gesture.
    act(() => result.current.modal.openModal());

    expect(result.current.canvas.engaged).toBe(false);
    // Identical thread, no duplicates: same conversationId, same turns.
    expect(result.current.canvas.conversationId).toBe('conv-1');
    expect(result.current.canvas.messages.filter((m) => m.type !== 'system')).toEqual(
      turnsBefore,
    );
  });

  test('collision: a canvas send with the drawer open closes the drawer and engages inline', async () => {
    const { result } = renderHook(
      () => ({ canvas: useCanvasEngagement({ workspaceId: 'ws-1' }), modal: useAgentModal() }),
      { wrapper },
    );

    act(() => result.current.modal.openModal());
    expect(result.current.modal.isOpen).toBe(true);

    act(() => result.current.canvas.send('Health-check my active work'));
    await flush();

    expect(result.current.modal.isOpen).toBe(false);
    expect(result.current.canvas.engaged).toBe(true);
    expect(result.current.canvas.conversationId).toBe('conv-1');
    expect(streamCalls).toHaveLength(1);
  });

  test('navigate-away mid-stream aborts and marks the turn incomplete in the surviving provider state', async () => {
    hangingStream();

    // The provider is app-level and survives navigation; only the /home
    // surface (the canvas hook's host) unmounts. Model that split directly.
    const canvasRef: { current: CanvasEngagement | null } = { current: null };
    const modalRef: { current: ReturnType<typeof useAgentModal> | null } = { current: null };
    function CanvasHost() {
      canvasRef.current = useCanvasEngagement({ workspaceId: 'ws-1' });
      return null;
    }
    function ModalProbe() {
      modalRef.current = useAgentModal();
      return null;
    }

    const { rerender } = render(
      <AgentModalProvider>
        <ModalProbe />
        <CanvasHost />
      </AgentModalProvider>,
    );

    act(() => canvasRef.current!.send('Long question'));
    await flush();
    expect(canvasRef.current!.isStreaming).toBe(true);

    // Navigate away: the canvas host unmounts, the provider stays.
    rerender(
      <AgentModalProvider>
        <ModalProbe />
      </AgentModalProvider>,
    );
    await flush();

    expect(streamCalls[0]?.options.signal?.aborted).toBe(true);
    expect(modalRef.current!.canvasEngaged).toBe(false);
    const last = modalRef.current!.messages.at(-1);
    expect(last?.type).toBe('ai');
    expect(last?.content).toBe('Partial…');
    expect(last?.failure).toMatchObject({
      severity: 'incomplete',
      canRetry: true,
      retryText: 'Long question',
    });
  });
});
