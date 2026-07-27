"use client";

import { memo, useEffect, useState } from "react";

import type { ToolCall } from "~/providers/AgentModalProvider";
import {
  buildRequestAck,
  COMPOSING_MESSAGE,
  narrateTool,
  THINKING_MESSAGES,
} from "./thinkingMessages";

const ROTATE_MS = 2500;

interface ThinkingStatusProps {
  /** The in-flight message's tool calls, if any have started. */
  toolCalls?: ToolCall[];
  /**
   * The user's just-submitted message. Used to render a deterministic,
   * request-aware acknowledgement the instant they hit send (no model call).
   */
  requestText?: string;
}

/**
 * Immediate, on-brand "thinking" affordance for Zoe's bubble, shown while the
 * bubble has no prose yet. Phases, all in Zoe's voice:
 *   0. the instant the message is sent → a request-aware acknowledgement
 *      derived client-side from the user's text ("On it — capturing that
 *      now…"), so the very first frame reads as Zoe acknowledging *this*
 *      request rather than a generic spinner
 *   1. before any tool fires  → rotating whimsical lines (fills the dead air)
 *   2. while a tool is running → narrates the actual activity ("Going through
 *      your projects…"), so the wait reads as her thinking out loud
 *   3. tools done, no text yet → "Putting it together…"
 * Client-only, zero added latency. The parent unmounts it once prose streams,
 * so the ack is ephemeral and never stacks above the final response.
 */
export const ThinkingStatus = memo(function ThinkingStatus({
  toolCalls,
  requestText,
}: ThinkingStatusProps) {
  const hasTools = !!toolCalls && toolCalls.length > 0;
  // Deterministic, instant ack from the request text (null when not echoable).
  const ack = buildRequestAck(requestText);

  // Random start so consecutive turns don't always open with the same line.
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length),
  );
  // The ack opens the turn; after one interval we fall into the rotating
  // thinking lines so a long pre-tool wait doesn't sit frozen on the ack.
  const [ackElapsed, setAckElapsed] = useState(false);

  useEffect(() => {
    // Only the pre-tool phase needs a timer; the tool/compose phases are driven
    // by toolCalls updates.
    if (hasTools) return;
    // While the ack is on screen, the first timer just retires it; the
    // rotating lines only start once the ack has had its moment.
    if (ack && !ackElapsed) {
      const id = setTimeout(() => setAckElapsed(true), ROTATE_MS);
      return () => clearTimeout(id);
    }
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % THINKING_MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [hasTools, ack, ackElapsed]);

  let message: string;
  if (hasTools) {
    // Narrate the most recent running tool; if all have settled, she's composing.
    const running = [...toolCalls].reverse().find((c) => c.status === "running");
    message = running ? narrateTool(running.name) : COMPOSING_MESSAGE;
  } else if (ack && !ackElapsed) {
    message = ack;
  } else {
    message = THINKING_MESSAGES[idx] ?? THINKING_MESSAGES[0];
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-2 flex items-center gap-2 text-text-secondary text-sm"
    >
      <span className="flex gap-1" aria-hidden="true">
        <span
          className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: "0ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: "150ms" }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full bg-text-muted animate-bounce"
          style={{ animationDelay: "300ms" }}
        />
      </span>
      {/* key forces a remount so each new line slides up and fades in */}
      <span
        key={message}
        className="animate-in fade-in slide-in-from-bottom-1 duration-300"
      >
        {message}
      </span>
    </div>
  );
});
