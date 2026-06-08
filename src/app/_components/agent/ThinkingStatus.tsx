"use client";

import { memo, useEffect, useState } from "react";

import { THINKING_MESSAGES } from "./thinkingMessages";

const ROTATE_MS = 2500;

/**
 * Immediate, on-brand "thinking" affordance for Zoe's bubble. Rendered the
 * instant the empty AI placeholder appears (before any tool-call or text
 * streams in) and unmounted by the parent the moment real content arrives.
 *
 * Rotates a Zoe-voiced status line every ~2.5s so a multi-second first
 * round-trip never leaves the bubble silent. Client-only, zero added latency.
 */
export const ThinkingStatus = memo(function ThinkingStatus() {
  // Random start so consecutive turns don't always open with the same line.
  const [idx, setIdx] = useState(() =>
    Math.floor(Math.random() * THINKING_MESSAGES.length),
  );

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % THINKING_MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const message = THINKING_MESSAGES[idx] ?? THINKING_MESSAGES[0];

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
      {/* key forces a remount so each new line fades in */}
      <span key={message} className="animate-in fade-in duration-300">
        {message}
      </span>
    </div>
  );
});
