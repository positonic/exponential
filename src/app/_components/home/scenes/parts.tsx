import type { ReactNode } from "react";
import { IconRobot } from "@tabler/icons-react";
import { Panel, Pill } from "~/app/_components/ui";

/**
 * Building blocks for the product scenes on the home page.
 *
 * A scene is an illustration of the product drawn in markup rather than a
 * screenshot: it stays sharp at any width, follows the theme, and carries
 * sample data written for the page. It must only show things the product
 * does. The sample company is a seed-stage startup; keep its people, agents
 * and projects the same across scenes so they read as one workspace.
 */

export type SceneTone = "violet" | "blue" | "green" | "amber" | "red" | "neutral";

const TONE_SOFT: Record<SceneTone, string> = {
  violet: "bg-accent-meetings/15 text-accent-meetings",
  blue: "bg-brand-400/15 text-brand-400",
  green: "bg-accent-crm/15 text-accent-crm",
  amber: "bg-accent-okr/15 text-accent-okr",
  red: "bg-accent-due/15 text-accent-due",
  neutral: "bg-surface-tertiary text-text-secondary",
};

const TONE_SOLID: Record<SceneTone, string> = {
  violet: "bg-accent-meetings",
  blue: "bg-brand-400",
  green: "bg-accent-crm",
  amber: "bg-accent-okr",
  red: "bg-accent-due",
  neutral: "bg-text-muted",
};

interface SceneFrameProps {
  /** Read by screen readers in place of the sample data inside. */
  description: string;
  /** The label in the window bar, e.g. the page the scene shows. */
  title: string;
  children: ReactNode;
  className?: string;
}

/** The window a scene sits in: a hairline frame with a quiet title bar. */
export function SceneFrame({ description, title, children, className }: SceneFrameProps) {
  return (
    <figure className={className}>
      <figcaption className="sr-only">{description}</figcaption>
      <Panel
        radius="xl"
        padding="none"
        className="overflow-hidden text-left shadow-xl"
        aria-hidden="true"
      >
        <div className="flex h-10 items-center gap-3 border-b border-border-primary px-4">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
            <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          </span>
          <span className="truncate text-xs text-text-muted">{title}</span>
        </div>
        {children}
      </Panel>
    </figure>
  );
}

interface AvatarProps {
  initials: string;
  tone?: SceneTone;
  size?: "sm" | "md" | "lg";
}

const AVATAR_SIZE = {
  sm: "h-5 w-5 text-[10px]",
  md: "h-7 w-7 text-xs",
  lg: "h-10 w-10 text-sm",
};

export function Avatar({ initials, tone = "neutral", size = "sm" }: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${AVATAR_SIZE[size]} ${TONE_SOFT[tone]}`}
    >
      {initials}
    </span>
  );
}

/** The badge an agent carries on everything it creates or changes. */
export function AgentPill() {
  return (
    <Pill tone="brand" size="xs" icon={<IconRobot size={11} stroke={2} />}>
      Agent
    </Pill>
  );
}

export function StatusDot({ tone }: { tone: SceneTone }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${TONE_SOLID[tone]}`} />;
}

export function ToneChip({ tone, children }: { tone: SceneTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${TONE_SOFT[tone]}`}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ percent, tone = "amber" }: { percent: number; tone?: SceneTone }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
      <span
        className={`block h-full rounded-full ${TONE_SOLID[tone]}`}
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

/** The small uppercase label above a group inside a scene. */
export function SceneLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-muted">
      {children}
    </p>
  );
}
