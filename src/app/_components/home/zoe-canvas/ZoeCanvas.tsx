'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Button } from '@mantine/core';
import { IconRefresh, IconSparkles, IconX } from '@tabler/icons-react';
import { MarkdownRenderer } from '~/app/_components/shared/MarkdownRenderer';
import { ToolActivity } from '~/app/_components/agent/ToolActivity';
import { ThinkingStatus } from '~/app/_components/agent/ThinkingStatus';
import { DraftActionsReviewCard } from '~/app/_components/DraftActionsReviewCard';
import { DraftFeaturesReviewCard } from '~/app/_components/DraftFeaturesReviewCard';
import { failureCopy } from '~/lib/chat/failureCopy';
import { useAgentModal, type ChatMessage } from '~/providers/AgentModalProvider';
import classes from './ZoeCanvas.module.css';

interface ZoeCanvasProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onDismiss: () => void;
  onRetry: (text: string) => void;
}

/**
 * The Zoe canvas (ADR-0040): the current engagement rendered in the /home
 * page content, in the dashboard-card visual language. Renders full
 * ChatMessage objects — markdown via the canonical MarkdownRenderer
 * (ADR-0017), live tool-activity chips, the failure/incomplete + Retry
 * treatment, and the structured `card` slot (ADR-0007) — so a future native
 * card is a new card kind, with zero canvas changes.
 */
export function ZoeCanvas({ messages, isStreaming, onDismiss, onRetry }: ZoeCanvasProps) {
  const { isOpen: drawerOpen } = useAgentModal();

  const visibleMessages = useMemo(
    () => messages.filter(m => m.type === 'human' || m.type === 'ai'),
    [messages],
  );

  // Esc dismisses the engagement — unless the drawer is open on top, whose own
  // Esc handler takes precedence.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !drawerOpen) onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [drawerOpen, onDismiss]);

  // Keep the newest turn in view as follow-ups append below the fold.
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(visibleMessages.length);
  useEffect(() => {
    if (visibleMessages.length > prevCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCountRef.current = visibleMessages.length;
  }, [visibleMessages.length]);

  const lastUserText = [...visibleMessages].reverse().find(m => m.type === 'human')?.content;

  return (
    <section className={classes.canvas} aria-label="Zoe canvas">
      <div className={classes.head}>
        <div className={classes.headTitle}>
          <span className={classes.headAvatar}>
            <IconSparkles size={13} />
          </span>
          Zoe
          <span className={classes.headSub}>{isStreaming ? 'working…' : 'answer'}</span>
        </div>
        <button
          type="button"
          className={classes.dismissBtn}
          onClick={onDismiss}
          aria-label="Dismiss (Esc)"
        >
          <IconX size={14} />
        </button>
      </div>

      <div className={classes.body}>
        {visibleMessages.map((message, index) =>
          message.type === 'human' ? (
            <div key={`human-${index}`} className={classes.userTurn}>
              {message.content}
            </div>
          ) : (
            <div key={message.interactionId ?? `ai-${index}`} className={classes.aiTurn}>
              {message.toolCalls && message.toolCalls.length > 0 && (
                <ToolActivity calls={message.toolCalls} />
              )}
              {isStreaming &&
                index === visibleMessages.length - 1 &&
                message.content === '' && (
                  <ThinkingStatus toolCalls={message.toolCalls} requestText={lastUserText} />
                )}
              {/* A clean error with no usable content renders only the failure
                  footer; otherwise the streamed text (full or partial). */}
              {!(message.failure?.severity === 'error' && message.content === '') && (
                <MarkdownRenderer content={message.content} variant="compact" />
              )}
              {message.failure && (
                <div className={classes.failureRow}>
                  {(message.failure.severity === 'incomplete' || message.content === '') && (
                    <span>{failureCopy(message.failure.kind, message.failure.severity)}</span>
                  )}
                  {message.failure.canRetry && message.failure.retryText && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      leftSection={<IconRefresh size={13} />}
                      onClick={() => onRetry(message.failure!.retryText!)}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              )}
              {/* The thrown error's own words — same treatment as the drawer,
                  so a specific cause isn't only visible on one surface. */}
              {message.failure?.detail && (
                <div className={classes.failureDetail}>{message.failure.detail}</div>
              )}
              {message.card?.kind === 'draft-actions' && (
                <DraftActionsReviewCard transcriptionId={message.card.transcriptionId} />
              )}
              {message.card?.kind === 'draft-features' && (
                <DraftFeaturesReviewCard transcriptionId={message.card.transcriptionId} />
              )}
            </div>
          ),
        )}
        <div ref={bottomRef} />
      </div>
    </section>
  );
}
