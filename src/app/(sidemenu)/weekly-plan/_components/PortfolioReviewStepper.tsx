"use client";

import { IconCheck } from "@tabler/icons-react";
import { COMPLETE_META, PHASE_META, type Phase } from "./types";

interface Props {
  current: Phase;
  furthestReached: Phase;
  onJump: (phase: Phase) => void;
}

const STEPS: Array<{
  phase: Exclude<Phase, "intro">;
  label: string;
  title: string;
  index: number;
}> = [
  { phase: "scope", ...PHASE_META.scope },
  { phase: "okrs", ...PHASE_META.okrs },
  { phase: "projects", ...PHASE_META.projects },
  { phase: "complete", ...COMPLETE_META },
];

const PHASE_INDEX: Record<Phase, number> = {
  intro: 0,
  scope: 1,
  okrs: 2,
  projects: 3,
  complete: 4,
};

export function PortfolioReviewStepper({
  current,
  furthestReached,
  onJump,
}: Props) {
  const currentIdx = PHASE_INDEX[current];
  const furthestIdx = PHASE_INDEX[furthestReached];

  return (
    <div className="pr-steps">
      {STEPS.map((step) => {
        const stepIdx = PHASE_INDEX[step.phase];
        const isCurrent = stepIdx === currentIdx;
        const isDone = stepIdx < currentIdx;
        const canJump = stepIdx <= furthestIdx;
        const cls = isCurrent
          ? "pr-step is-current"
          : isDone
            ? "pr-step is-done"
            : "pr-step";
        return (
          <button
            key={step.phase}
            type="button"
            className={cls}
            disabled={!canJump}
            onClick={() => canJump && onJump(step.phase)}
          >
            <span className="pr-step__num">
              {isDone ? <IconCheck size={12} /> : step.index}
            </span>
            <div>
              <div className="pr-step__label">{step.label}</div>
              <div className="pr-step__title">{step.title}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
