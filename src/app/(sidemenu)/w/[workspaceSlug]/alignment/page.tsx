'use client';

import { Button } from '@mantine/core';
import {
  IconArrowRight,
  IconFileText,
  IconFlag,
  IconPlus,
  IconRefresh,
  IconTarget,
  IconTargetArrow,
  type Icon,
  type IconProps,
} from '@tabler/icons-react';
import Link from 'next/link';
import { type ForwardRefExoticComponent, type RefAttributes } from 'react';
import { useWorkspace } from '~/providers/WorkspaceProvider';

type TablerIcon = ForwardRefExoticComponent<IconProps & RefAttributes<Icon>>;

interface Pillar {
  number: string;
  title: string;
  description: string;
  icon: TablerIcon;
  iconClass: string;
  href: string;
  metric: string;
  metricLabel: string;
}

const PILLARS: Pillar[] = [
  {
    number: '01',
    title: 'Objectives',
    description:
      'Strategic objectives linked to life domains. The foundation of your alignment system.',
    icon: IconTarget,
    iconClass: 'bg-blue-500/10 text-blue-400',
    href: '/goals',
    metric: '6',
    metricLabel: 'active',
  },
  {
    number: '02',
    title: 'Outcomes',
    description:
      'Measurable results at different time horizons. Track what you want to achieve daily, weekly, monthly.',
    icon: IconFlag,
    iconClass: 'bg-yellow-500/10 text-yellow-400',
    href: '/outcomes',
    metric: '14',
    metricLabel: 'tracked',
  },
  {
    number: '03',
    title: 'Habits',
    description:
      'Daily and weekly routines that compound over time. Link habits to goals for purposeful consistency.',
    icon: IconRefresh,
    iconClass: 'bg-green-500/10 text-green-400',
    href: '/habits',
    metric: '9',
    metricLabel: 'running',
  },
  {
    number: '04',
    title: 'OKRs',
    description:
      'Objectives & Key Results for quantitative goal tracking. Set targets and measure progress.',
    icon: IconTargetArrow,
    iconClass: 'bg-blue-500/10 text-blue-400',
    href: '/okrs',
    metric: '4',
    metricLabel: 'this quarter',
  },
];

interface FlowStep {
  number: number;
  title: string;
  tag: string;
  description: string;
}

const FLOW_STEPS: FlowStep[] = [
  {
    number: 1,
    title: 'Set Objectives',
    tag: 'Define',
    description:
      'Create strategic objectives in the life domains that matter most. Anchor each one to a clear intent.',
  },
  {
    number: 2,
    title: 'Define Outcomes',
    tag: 'Specify',
    description:
      'Translate each objective into measurable outcomes at different time horizons — weekly, monthly, quarterly.',
  },
  {
    number: 3,
    title: 'Build Habits',
    tag: 'Practice',
    description:
      'Establish the daily routines that compound. Link each habit to the outcome it serves.',
  },
  {
    number: 4,
    title: 'Track with OKRs',
    tag: 'Measure',
    description:
      'Set Key Results, check in weekly, and adjust pace as you learn. Confidence is part of the signal.',
  },
  {
    number: 5,
    title: 'Review & Refine',
    tag: 'Adapt',
    description:
      "Reflect at the end of each cycle. Keep what's working, retire what isn't, and re-align with intent.",
  },
];

interface TimelineItem {
  label: string;
  text: string;
  dotClass: string;
}

const TIMELINE: TimelineItem[] = [
  {
    label: 'Objective',
    text: 'Build a calmer, more deliberate life',
    dotClass: 'border-blue-400',
  },
  {
    label: 'Outcome',
    text: 'Reach 30 deep-work hours/week by July',
    dotClass: 'border-yellow-400',
  },
  {
    label: 'Habit',
    text: 'Morning block: 7:30–10:30am, no meetings',
    dotClass: 'border-green-400',
  },
  {
    label: 'OKR',
    text: 'KR1.2 — Deep-work hours/week 22 → 30',
    dotClass: 'border-violet-400',
  },
];

interface Stat {
  label: string;
  value: string;
  caption: string;
}

const STATS: Stat[] = [
  { label: 'Alignment health', value: '82%', caption: '+6 pts vs last month' },
  { label: 'Active objectives', value: '6', caption: 'across 4 life domains' },
  { label: 'Habit streak', value: '21 days', caption: 'Longest this quarter' },
  { label: 'Outcomes on track', value: '11 / 14', caption: '3 need attention' },
];

function SectionLabel({
  label,
  meta,
}: {
  label: string;
  meta?: string;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-text-muted">
        {label}
      </span>
      {meta && (
        <>
          <span className="h-px flex-1 bg-border-primary" />
          <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-text-muted">
            {meta}
          </span>
        </>
      )}
      {!meta && <span className="h-px flex-1 bg-border-primary" />}
    </div>
  );
}

export default function AlignmentPage() {
  const { workspace, workspaceSlug } = useWorkspace();

  if (!workspaceSlug) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="text-text-secondary">Loading workspace...</span>
      </div>
    );
  }

  const basePath = `/w/${workspaceSlug}`;
  const workspaceTag = (workspace?.name ?? 'Workspace').toUpperCase();

  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 py-10 lg:px-10 lg:py-12">
      {/* Header */}
      <div className="mb-12 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />
            <span>{workspaceTag} · Life Alignment</span>
          </div>
          <h1 className="text-[40px] font-semibold leading-tight tracking-tight text-text-primary">
            Alignment system
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-text-secondary">
            Connect your daily actions to your life vision. Understand how
            goals, habits, outcomes, and OKRs work together to create
            meaningful progress.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="default"
            leftSection={<IconFileText size={15} />}
            radius="md"
          >
            Templates
          </Button>
          <Button
            component={Link}
            href={`${basePath}/goals`}
            leftSection={<IconPlus size={15} />}
            radius="md"
          >
            New objective
          </Button>
        </div>
      </div>

      {/* The Four Pillars */}
      <section className="mb-14">
        <SectionLabel label="The Four Pillars" meta="4 components" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((pillar) => (
            <Link
              key={pillar.title}
              href={`${basePath}${pillar.href}`}
              className="group flex flex-col rounded-xl border border-border-primary bg-surface-secondary p-5 transition-colors hover:border-border-focus"
            >
              <div className="mb-6 flex items-start justify-between">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${pillar.iconClass}`}
                >
                  <pillar.icon size={18} />
                </span>
                <span className="text-[11px] font-semibold tabular-nums text-text-muted">
                  {pillar.number}
                </span>
              </div>
              <h3 className="text-[17px] font-semibold text-text-primary">
                {pillar.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                {pillar.description}
              </p>
              <div className="mt-6 flex items-center justify-between border-t border-border-primary pt-3">
                <span className="text-[12.5px] text-text-secondary">
                  <span className="font-semibold text-text-primary tabular-nums">
                    {pillar.metric}
                  </span>{' '}
                  {pillar.metricLabel}
                </span>
                <IconArrowRight
                  size={15}
                  className="text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-text-primary"
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="mb-14">
        <SectionLabel label="How It Works" />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-xl border border-border-primary bg-surface-secondary p-7">
            <h3 className="text-[18px] font-semibold text-text-primary">
              From intent to action
            </h3>
            <p className="mt-1.5 text-[13.5px] text-text-secondary">
              A repeatable loop that keeps daily routines tied to long-term
              direction.
            </p>
            <ol className="mt-6 divide-y divide-border-primary">
              {FLOW_STEPS.map((step) => (
                <li
                  key={step.number}
                  className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border-primary bg-background-elevated text-[12px] font-semibold tabular-nums text-text-secondary">
                    {step.number}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-text-primary">
                        {step.title}
                      </span>
                      <span className="rounded border border-border-primary px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.06em] text-text-muted">
                        {step.tag}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-text-secondary">
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-border-primary bg-surface-secondary p-7">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              Alignment, end-to-end
            </span>
            <p className="mt-2 text-[13.5px] text-text-secondary">
              One thread, four layers. Every habit traces up to the objective
              it serves.
            </p>
            <ul className="mt-6 space-y-5">
              {TIMELINE.map((item, idx) => (
                <li key={item.label} className="relative flex gap-4 pl-1">
                  <span className="relative flex flex-col items-center">
                    <span
                      className={`mt-1 h-3 w-3 rounded-full border-2 bg-background-primary ${item.dotClass}`}
                    />
                    {idx < TIMELINE.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-border-primary" />
                    )}
                  </span>
                  <div className="min-w-0 pb-2">
                    <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      {item.label}
                    </div>
                    <div className="mt-0.5 text-[13.5px] text-text-primary">
                      {item.text}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Where You Stand */}
      <section>
        <SectionLabel label="Where You Stand" />
        <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-border-primary bg-surface-secondary sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat, idx) => {
            const borderCls =
              [
                '',
                'border-t border-border-primary sm:border-t-0 sm:border-l',
                'border-t border-border-primary lg:border-t-0 lg:border-l',
                'border-t border-border-primary sm:border-l lg:border-t-0',
              ][idx] ?? '';
            return (
              <div key={stat.label} className={`p-6 ${borderCls}`}>
                <div className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                  {stat.label}
                </div>
                <div className="mt-3 text-[28px] font-semibold leading-none text-text-primary tabular-nums">
                  {stat.value}
                </div>
                <div className="mt-2 text-[12.5px] text-text-secondary">
                  {stat.caption}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
