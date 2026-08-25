'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '~/trpc/react';
import { useAgentModal, type ChatMessage } from '~/providers/AgentModalProvider';
import { streamChatResponse, type ChatStreamCoreMessage } from '~/lib/chat/streamChatResponse';
import { classifyStreamError, describeStreamError } from '~/lib/chat/streamProtocol';
import { reportHandledError } from '~/lib/reportHandledError';
import { cardFromToolCalls } from '~/lib/chat/cardFromToolCalls';
import { trimByTokenBudget } from '~/lib/trim-conversation';
import { applyToolRefreshInvalidations } from '~/app/_components/agent/toolRefreshInvalidation';

/** Mirrors ManyChat: silent re-attempts after a contentless transport drop. */
const MAX_AUTO_RETRIES = 2;
const HISTORY_TOKEN_BUDGET = 20_000;

interface UseCanvasEngagementOptions {
  workspaceId?: string | null;
  /** Gate the hook's queries off entirely for opted-out users. */
  enabled?: boolean;
}

export interface CanvasEngagement {
  /** True while an engagement (open→dismiss cycle, ADR-0040) is active. */
  engaged: boolean;
  isStreaming: boolean;
  /** The shared conversation state, system message included. */
  messages: ChatMessage[];
  conversationId: string;
  /** Send from the hero input or a chip. Starts an engagement if none is active. */
  send: (text: string) => void;
  /** Re-run a failed/incomplete turn, reusing the trailing assistant bubble. */
  retry: (text: string) => void;
  /** ✕/Esc: abort any in-flight stream (marking the turn incomplete) and end the engagement. */
  dismiss: () => void;
}

/**
 * Engagement lifecycle + streaming loop for the Zoe canvas (ADR-0040).
 *
 * The canvas is a third display surface of the SAME conversation state the
 * Zoe drawer shows (`AgentModalProvider` messages/conversationId — the
 * ADR-0006 sharing pattern), but each engagement starts a fresh Thread: a
 * chip click or hero send is an implicit "new thread + send" with a new
 * conversationId. Follow-ups continue that thread; dismissal ends it. The
 * previous drawer thread survives in conversation history — it just stops
 * being the active one.
 */
export function useCanvasEngagement({
  workspaceId,
  enabled = true,
}: UseCanvasEngagementOptions = {}): CanvasEngagement {
  const {
    messages,
    setMessages,
    conversationId,
    setConversationId,
    canvasEngaged,
    setCanvasEngaged,
    pageContext,
    isOpen: drawerOpen,
    closeModal: closeDrawer,
  } = useAgentModal();
  const utils = api.useUtils();

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dismissedRef = useRef(false);
  // The active engagement's conversationId, readable synchronously (provider
  // state updates are async, and a follow-up can fire before a re-render).
  const engagementIdRef = useRef<string | null>(null);

  const startConversation = api.aiInteraction.startConversation.useMutation();
  const { data: customAssistant } = api.assistant.getDefault.useQuery(
    { workspaceId: workspaceId ?? '' },
    { enabled: enabled && !!workspaceId },
  );
  const { data: mastraAgents } = api.mastra.getMastraAgents.useQuery(undefined, {
    enabled,
    staleTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  /** Rewrite the trailing assistant bubble (the one this turn streams into). */
  const patchTrailingAi = useCallback(
    (patch: Partial<ChatMessage> | ((last: ChatMessage) => Partial<ChatMessage>)) => {
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.type === 'ai') {
          const resolved = typeof patch === 'function' ? patch(last) : patch;
          updated[updated.length - 1] = { ...last, ...resolved };
        }
        return updated;
      });
    },
    [setMessages],
  );

  const sendTurn = useCallback(
    async (text: string, attempt: number): Promise<void> => {
      const trimmedText = text.trim();
      if (!trimmedText || isStreaming) return;
      const isRetry = attempt > 0;

      // Collision rule: a canvas send with the drawer open closes the drawer
      // and answers inline — the canvas is the surface the user just chose.
      if (drawerOpen) closeDrawer();

      const agentName = customAssistant?.name ?? 'Zoe';
      let engagementConversationId = engagementIdRef.current;
      const isNewEngagement = !canvasEngaged || !engagementConversationId;

      // Seed the transcript synchronously so the dashboard yields and the
      // user's question echoes before the (async) thread mint resolves.
      if (isNewEngagement) {
        dismissedRef.current = false;
        setCanvasEngaged(true);
        setMessages(prev => {
          const system = prev.find(m => m.type === 'system');
          const seed: ChatMessage[] = system ? [system] : [];
          return [
            ...seed,
            { type: 'human', content: trimmedText },
            { type: 'ai', agentName, content: '' },
          ];
        });
      } else if (!isRetry) {
        setMessages(prev => [
          ...prev,
          { type: 'human', content: trimmedText },
          { type: 'ai', agentName, content: '' },
        ]);
      } else {
        // Retry reuses the trailing (failed/incomplete) bubble — reset its text
        // and clear the failure/tool markers so the re-stream renders cleanly.
        patchTrailingAi({ agentName, content: '', failure: undefined, toolCalls: undefined });
      }

      if (isNewEngagement) {
        // Fresh Thread per engagement (ADR-0040). Fall back to a client id on
        // failure — /api/chat/stream accepts client-provided conversation ids.
        try {
          const res = await startConversation.mutateAsync({ platform: 'web-canvas' });
          engagementConversationId = res.conversationId;
        } catch {
          engagementConversationId = `conv_canvas_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
        }
        setConversationId(engagementConversationId);
        // Dismissed while the mint was in flight — the engagement is over
        // before it streamed. Same abort rule: the turn ends `incomplete`.
        if (dismissedRef.current) {
          patchTrailingAi({
            failure: {
              severity: 'incomplete',
              kind: 'unknown',
              canRetry: true,
              retryText: trimmedText,
            },
          });
          return;
        }
        engagementIdRef.current = engagementConversationId;
      }

      // Route like ManyChat's default path: a custom assistant rides the
      // blank-canvas assistantAgent; otherwise Zoe.
      const zoeAgent = mastraAgents?.find(
        a => a.name.toLowerCase() === 'zoe' || a.id.toLowerCase() === 'zoeagent',
      );
      const agentId = customAssistant ? 'assistantAgent' : zoeAgent?.id;

      // Prior turns of THIS engagement only (fresh Thread — never steered by
      // hidden context). Failed/incomplete bubbles aren't real prior turns.
      const coreMessages: ChatStreamCoreMessage[] = [];
      const systemContent = messages.find(m => m.type === 'system')?.content;
      if (systemContent) coreMessages.push({ role: 'system', content: systemContent });
      if (!isNewEngagement) {
        for (const msg of messages) {
          if (msg.type === 'human') {
            coreMessages.push({ role: 'user', content: msg.content });
          } else if (msg.type === 'ai' && msg.content && !msg.failure) {
            coreMessages.push({ role: 'assistant', content: msg.content });
          }
        }
      }
      coreMessages.push({ role: 'user', content: trimmedText });
      const trimmed = trimByTokenBudget(coreMessages, HISTORY_TOKEN_BUDGET);

      const abortController = new AbortController();
      abortRef.current = abortController;
      setIsStreaming(true);
      // Bytes of stream seen this attempt — decides auto-retry vs `incomplete`.
      let streamedChars = 0;

      try {
        const streamResult = await streamChatResponse(
          {
            messages: trimmed.messages,
            agentId,
            assistantId: customAssistant?.id ?? null,
            workspaceId: workspaceId ?? null,
            conversationId: engagementConversationId,
            // Distinct stamp for canvas turns (ADR-0040): the interaction-
            // history rows this send produces are attributed to the canvas so
            // the agent-quality machinery compares canvas vs drawer Threads.
            platform: 'web-canvas',
          },
          {
            signal: abortController.signal,
            onUpdate: update => {
              streamedChars = update.rawLength;
              patchTrailingAi({
                content: update.displayText,
                ...(update.toolCalls.length > 0 ? { toolCalls: update.toolCalls } : {}),
              });
            },
          },
        );

        setIsStreaming(false);

        const executedToolNames = streamResult.toolCalls
          .filter(tc => tc.status === 'success')
          .map(tc => tc.name);
        applyToolRefreshInvalidations(utils, executedToolNames, pageContext?.pageType);

        // Conversational ideation (V2): attach the draft-features review card
        // when the agent ran `ideate-features`, same as the drawer does.
        const card = cardFromToolCalls(streamResult.toolCalls);
        if (card) {
          patchTrailingAi({ card });
        }

        // A turn that did tool work but produced no prose is NOT empty — the
        // user sees those calls in the tool-activity row.
        if (streamResult.displayText.trim() === '' && streamResult.toolCalls.length === 0) {
          patchTrailingAi({
            content: `The assistant started but didn't produce a reply — a tool may have failed or the step budget ran out.`,
            failure: { severity: 'error', kind: 'model', canRetry: true, retryText: trimmedText },
          });
        }

        if (streamResult.interactionId) {
          patchTrailingAi({ interactionId: streamResult.interactionId });
        }
      } catch (error) {
        const wasDismissed = dismissedRef.current;
        const { kind, retryable } = classifyStreamError(error);
        const hadContent = streamedChars > 0;

        // Auto-retry a contentless transport blip, exactly like ManyChat —
        // but never a deliberate dismiss.
        if (!wasDismissed && retryable && !hadContent && attempt < MAX_AUTO_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
          void sendTurn(text, attempt + 1);
          return;
        }

        setIsStreaming(false);

        // A dismissal is the user's own doing, not a fault — reporting those
        // would fill the tracker with people changing their minds.
        if (!wasDismissed) {
          reportHandledError(error, {
            area: 'zoe-canvas-stream',
            kind,
            context: { hadContent: String(hadContent), attempt: String(attempt) },
          });
        }

        // One abort rule (ADR-0040): a dismissal mid-stream marks the turn
        // `incomplete` — the existing partial-answer + Retry treatment, visible
        // in the drawer where the thread lives on.
        const severity: 'error' | 'incomplete' =
          wasDismissed || hadContent ? 'incomplete' : 'error';
        patchTrailingAi(last => ({
          agentName: severity === 'error' ? (last.agentName ?? 'Assistant') : last.agentName,
          content: severity === 'error' ? '' : last.content,
          failure: { severity, kind, canRetry: kind !== 'auth', retryText: trimmedText, detail: describeStreamError(error) },
        }));
      } finally {
        if (abortRef.current === abortController) abortRef.current = null;
      }
    },
    [
      isStreaming,
      canvasEngaged,
      setCanvasEngaged,
      setMessages,
      setConversationId,
      patchTrailingAi,
      messages,
      customAssistant,
      mastraAgents,
      startConversation,
      workspaceId,
      utils,
      pageContext?.pageType,
      drawerOpen,
      closeDrawer,
    ],
  );

  const send = useCallback((text: string) => void sendTurn(text, 0), [sendTurn]);
  const retry = useCallback((text: string) => void sendTurn(text, 1), [sendTurn]);

  const dismiss = useCallback(() => {
    dismissedRef.current = true;
    abortRef.current?.abort(new DOMException('canvas-dismissed', 'AbortError'));
    abortRef.current = null;
    engagementIdRef.current = null;
    setCanvasEngaged(false);
    // The engagement's thread stays the provider's active conversationId, so
    // opening the drawer next shows these same turns (drawer = full history).
  }, [setCanvasEngaged]);

  // Handoff (canvas → drawer): the drawer opening while an engagement is
  // active is the "continue in panel" gesture (⌘J or the FAB). The drawer
  // reads the same provider state, so it shows the identical turns; the
  // canvas dismisses — mid-stream that aborts and marks the turn incomplete,
  // the one abort rule (ADR-0040). Rising-edge detection so a send that just
  // CLOSED the drawer (the chip collision rule) can't trigger a dismissal.
  const prevDrawerOpenRef = useRef(drawerOpen);
  useEffect(() => {
    const wasOpen = prevDrawerOpenRef.current;
    prevDrawerOpenRef.current = drawerOpen;
    if (drawerOpen && !wasOpen && canvasEngaged) dismiss();
  }, [drawerOpen, canvasEngaged, dismiss]);

  // Navigate-away abort: leaving /home mid-engagement is a dismissal — same
  // abort + `incomplete` treatment as ✕/Esc. The partial turn stays in the
  // (app-level) provider state, recoverable via Retry in the drawer.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  useEffect(() => () => dismissRef.current(), []);

  return {
    engaged: canvasEngaged,
    isStreaming,
    messages,
    conversationId,
    send,
    retry,
    dismiss,
  };
}
