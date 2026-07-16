"use client";

import {
  IconCalendar,
  IconCheck,
  IconCheckbox,
  IconClock,
  IconSparkles,
  IconTarget,
} from "@tabler/icons-react";
import {
  FRAMEWORK_CELLS,
  STEPS,
  STEP_ORDER,
  type StepId,
} from "./welcomeCopy";
import styles from "./Welcome.module.css";

export const STEP_ICONS: Record<StepId, React.ElementType> = {
  goal: IconTarget,
  action: IconCheckbox,
  plan: IconClock,
  cal: IconCalendar,
};

export function AssistantAvatar({ size = 28 }: { size?: number }) {
  return (
    <div className={styles.asstAvatar} style={{ width: size, height: size }}>
      <IconSparkles size={size * 0.55} />
    </div>
  );
}

export function TypingDots() {
  return (
    <span className={styles.typing}>
      <i />
      <i />
      <i />
    </span>
  );
}

const BURST_COLORS = [
  "var(--brand-400)",
  "var(--accent-meetings)",
  "var(--accent-crm)",
  "var(--accent-okr)",
  "var(--accent-quick)",
];

/** Small CSS confetti burst played on step completion. */
export function Burst() {
  return (
    <span className={styles.burst} aria-hidden="true">
      {Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2;
        const radius = 34 + (i % 3) * 16;
        return (
          <i
            key={i}
            style={
              {
                background: BURST_COLORS[i % BURST_COLORS.length],
                "--bx": `${Math.cos(angle) * radius}px`,
                "--by": `${Math.sin(angle) * radius - 20}px`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

interface ProgressProps {
  isStepDone: (id: StepId) => boolean;
  nextStep: StepId | null;
  doneCount: number;
}

/** Numbered-nodes progress indicator (chosen default style). */
export function ProgressNodes({ isStepDone, nextStep, doneCount }: ProgressProps) {
  return (
    <div className={styles.pviz}>
      <div className={styles.pvizNodes}>
        {STEP_ORDER.map((id, i) => {
          const done = isStepDone(id);
          const nodeClass = done
            ? `${styles.pvizNode} ${styles.nodeDone}`
            : id === nextStep
              ? `${styles.pvizNode} ${styles.nodeNext}`
              : styles.pvizNode;
          return (
            <span key={id} style={{ display: "contents" }}>
              {i > 0 && (
                <span
                  className={
                    done ? `${styles.pvizSeg} ${styles.segDone}` : styles.pvizSeg
                  }
                />
              )}
              <span className={nodeClass} title={STEPS[i]?.title}>
                {done ? <IconCheck size={11} /> : i + 1}
              </span>
            </span>
          );
        })}
      </div>
      <span className={styles.pvizCount}>
        {doneCount} of {STEP_ORDER.length}
      </span>
    </div>
  );
}

/** Goals → Actions → Today diagram; cells light up as steps complete. */
export function FrameworkViz({ isStepDone }: { isStepDone: (id: StepId) => boolean }) {
  return (
    <div className={styles.fwViz}>
      {FRAMEWORK_CELLS.map((cell) => {
        const Icon = STEP_ICONS[cell.step];
        return (
          <div
            key={cell.step}
            className={
              isStepDone(cell.step)
                ? `${styles.fwStep} ${styles.fwLit}`
                : styles.fwStep
            }
          >
            <div className={styles.fwStepName}>
              <Icon size={13} />
              {cell.name}
            </div>
            <div className={styles.fwStepDesc}>{cell.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

const ARTIFACT_META: Record<
  "goal" | "action" | "cal",
  { iconClass: string; kind: string; meta: string }
> = {
  goal: { iconClass: "artifactIconGoal", kind: "Goal", meta: "Active · your workspace" },
  action: {
    iconClass: "artifactIconAction",
    kind: "Action",
    meta: "Due today · linked to your goal",
  },
  cal: { iconClass: "artifactIconCal", kind: "Calendar", meta: "Synced · two-way" },
};

/** Card shown when a real object has been created during setup. */
export function ArtifactCard({
  type,
  title,
  linkFrom,
}: {
  type: "goal" | "action" | "cal";
  title: string;
  linkFrom?: string;
}) {
  const meta = ARTIFACT_META[type];
  const Icon = STEP_ICONS[type];
  return (
    <div>
      {linkFrom && (
        <div className={styles.linkline}>
          <i />
          linked to {linkFrom}
        </div>
      )}
      <div className={styles.artifact}>
        <div className={`${styles.artifactIcon} ${styles[meta.iconClass]}`}>
          <Icon size={17} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className={styles.artifactTitle}>{title}</div>
          <div className={styles.artifactMeta}>
            {meta.kind} · {meta.meta}
          </div>
        </div>
        <span className={styles.artifactCheck}>
          <IconCheck size={16} />
        </span>
      </div>
    </div>
  );
}

/** Preview of the three-block first day plan (mirrors what planDay creates). */
export function PlanPreview({ actionName }: { actionName: string | null }) {
  return (
    <div className={styles.planCard}>
      <div className={styles.planCardHead}>
        <span>Today · first plan</span>
        <span>3 blocks</span>
      </div>
      <div className={styles.planRow}>
        <span className={styles.planRowTime}>9:00</span>
        <span className={`${styles.planRowDot} ${styles.planDotAction}`} />
        <span className={styles.planRowLabel}>
          {actionName ?? "Your first action"}
        </span>
      </div>
      <div className={styles.planRow}>
        <span className={styles.planRowTime}>9:45</span>
        <span className={`${styles.planRowDot} ${styles.planDotGoal}`} />
        <span className={styles.planRowLabel}>Break your goal into next actions</span>
      </div>
      <div className={styles.planRow}>
        <span className={styles.planRowTime}>16:30</span>
        <span className={`${styles.planRowDot} ${styles.planDotReview}`} />
        <span className={styles.planRowLabel}>5-minute end-of-day review</span>
      </div>
      <div className={`${styles.planRow} ${styles.planRowGhost}`}>
        <span className={styles.planRowTime}>—</span>
        <span className={`${styles.planRowDot} ${styles.planDotGhost}`} />
        <span className={styles.planRowLabel}>
          Meetings appear here once a calendar is connected
        </span>
      </div>
    </div>
  );
}
