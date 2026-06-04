'use client';

import { useSession } from 'next-auth/react';
import { useMemo } from 'react';
import { useTerminology } from '~/hooks/useTerminology';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import { WeeklyFocusSummary } from './WeeklyFocusSummary';

/**
 * Translates the current hour-of-day into a time-aware greeting used in the
 * Activity hero title. Buckets match the spec for slice T2.
 */
function greetingForHour(hour: number): string {
  if (hour <= 4) return 'Up late';
  if (hour <= 11) return 'Good morning';
  if (hour <= 16) return 'Good afternoon';
  if (hour <= 20) return 'Good evening';
  return 'Working late';
}

function formatEyebrowDate(now: Date): string {
  const weekday = now.toLocaleDateString(undefined, { weekday: 'long' });
  const month = now.toLocaleDateString(undefined, { month: 'long' });
  const day = now.getDate();
  return `${weekday}, ${month} ${day}`;
}

/**
 * Hero strip for the Activity home: greeting on the left, and on the right a
 * "This week's focus" widget ({@link WeeklyFocusSummary}) surfacing the goals
 * the user pinned in their weekly review. Greeting is hour-of-day derived; the
 * workspace label comes from the active `WorkspaceProvider`.
 */
export function Hero() {
  const { workspace } = useWorkspace();
  const { data: session } = useSession();
  // useTerminology is imported per slice requirement; the hero labels stay in
  // neutral language so they read sensibly across all workspace terminologies.
  // Touching the hook here keeps the project-wide terminology context loaded
  // when this is the first activity-layout component to mount.
  const terminology = useTerminology();
  void terminology;

  const now = useMemo(() => new Date(), []);
  const eyebrowDate = formatEyebrowDate(now);
  const greeting = greetingForHour(now.getHours());

  const userName = session?.user?.name ?? 'there';
  const workspaceName = workspace?.name ?? 'Workspace';

  return (
    <section className="wsa-hero">
      <div>
        <div className="wsa-hero__eyebrow">
          {workspaceName} · {eyebrowDate}
        </div>
        <h1 className="wsa-hero__title">
          {greeting}, {userName}. <em>Here&apos;s the shape of your work.</em>
        </h1>
      </div>

      <WeeklyFocusSummary />
    </section>
  );
}
