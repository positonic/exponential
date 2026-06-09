"use client";

import { IconCheck, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface WpStepperProps {
  /** Every project in the review pass, in pass order. */
  projects: { id: string; name: string }[];
  /** 0-based index of the project currently being reviewed. */
  currentIndex: number;
  /** Ids of projects already marked reviewed. */
  reviewedIds: Set<string>;
  /** Jump to a project by index (clamped by the page). */
  onJump: (index: number) => void;
}

/**
 * Unified stepper — the single control for the Project Pass.
 *
 * Replaces BOTH the old top progress strip (ReviewProgress) and the in-card
 * "03 / 12" nav. Shows every project as a chip (reviewing / reviewed / up next),
 * is clickable to jump, and carries prev/next arrows + an "N / total · X to go"
 * count. Styling here is placeholder (Stage 1); the hi-fi pass lands in Stage 2.
 */
export function WpStepper({
  projects,
  currentIndex,
  reviewedIds,
  onJump,
}: WpStepperProps) {
  const total = projects.length;
  const reviewedCount = reviewedIds.size;
  const remaining = Math.max(total - reviewedCount, 0);

  return (
    <nav
      aria-label="Projects in this pass"
      className="mb-6 flex items-center gap-3"
    >
      <button
        type="button"
        aria-label="Previous project"
        disabled={currentIndex === 0}
        onClick={() => onJump(currentIndex - 1)}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border-primary bg-surface-secondary text-text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <IconChevronLeft size={16} />
      </button>

      <ol className="hidden flex-1 auto-cols-fr grid-flow-col gap-2 min-[821px]:grid">
        {projects.map((p, i) => {
          const done = reviewedIds.has(p.id);
          const current = i === currentIndex;
          const label = done ? "Reviewed" : current ? "Reviewing" : "Up next";
          return (
            <li key={p.id} className="min-w-0">
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={current ? "step" : undefined}
                className={
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 " +
                  (current
                    ? "border-blue-500/50 bg-blue-500/10"
                    : "border-border-subtle bg-surface-secondary hover:border-border-strong")
                }
              >
                <span
                  className={
                    "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-semibold " +
                    (current
                      ? "bg-blue-500 text-white"
                      : done
                        ? "bg-green-500/20 text-green-500"
                        : "bg-surface-hover text-text-muted")
                  }
                >
                  {done ? <IconCheck size={13} /> : i + 1}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[9.5px] font-semibold uppercase tracking-wider text-text-muted">
                    {label}
                  </span>
                  <span className="truncate text-xs text-text-secondary">
                    {p.name}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        aria-label="Next project"
        disabled={currentIndex >= total - 1}
        onClick={() => onJump(currentIndex + 1)}
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border-primary bg-surface-secondary text-text-secondary hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-30"
      >
        <IconChevronRight size={16} />
      </button>

      <div className="ml-auto min-w-[86px] flex-shrink-0 text-right text-xs text-text-muted">
        <strong className="block text-sm font-semibold text-text-primary">
          {reviewedCount} / {total}
        </strong>
        {remaining} to go
      </div>
    </nav>
  );
}
