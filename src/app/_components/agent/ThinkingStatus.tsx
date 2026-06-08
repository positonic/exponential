"use client";

import { memo, useEffect, useState } from "react";

import type { ToolCall } from "~/providers/AgentModalProvider";
import {
  COMPOSING_MESSAGE,
  narrateTool,
  THINKING_MESSAGES,
} from "./thinkingMessages";

const ROTATE_MS = 2500;

interface ThinkingStatusProps {
  /** The in-flight message's tool calls, if any have started. */
  toolCalls?: ToolCall[];
}

/**
 * Immediate, on-brand "thinking" affordance for Zoe's bubble, shown while the
 * bubble has no prose yet. Three phases, all in Zoe's voice:
 *   1. before any tool fires  → rotating whimsical lines (fills the first ~5s)
 *   2. while a tool is running → narrates the actual activity ("Going through
 *      your projects…"), so the wait reads as her thinking out loud
 *   3. tools done, no text yet → "Putting it together…"
 * Client-only, zero added latency. The parent unmounts it once prose streams.
 */
export const ThinkingStatus = memo(function ThinkingStatus({
  toolCalls,
}: ThinkingStatusProps) {
  const hasTools = !!toolCalls && toolCalls.length > 0;

  // Random start so consecutive turns don't always open with the same line.
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length),
  );

  useEffect(() => {
    // Only the pre-tool phase needs a timer; the tool/compose phases are driven
    // by toolCalls updates.
    if (hasTools) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % THINKING_MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [hasTools]);

  let message: string;
  if (hasTools) {
    // Narrate the most recent running tool; if all have settled, she's composing.
    const running = [...toolCalls].reverse().find((c) => c.status === "running");
    message = running ? narrateTool(running.name) : COMPOSING_MESSAGE;
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
