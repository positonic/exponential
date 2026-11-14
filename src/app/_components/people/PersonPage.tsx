'use client';

import { Container, Skeleton, Stack } from '@mantine/core';
import {
  notFound,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { WeeklyWorkDigestPanel } from '~/app/_components/home/activity/WeeklyWorkDigestPanel';
import { api } from '~/trpc/react';
import { PersonFeed } from './PersonFeed';
import { PersonHeader } from './PersonHeader';
import { PersonWeekSummaryPanel } from './PersonWeekSummaryPanel';

import '~/app/_components/home/activity/activity-home.css';

interface PersonPageProps {
  userId: string;
}

/**
 * The Person page. Read-only: a header saying who the subject is and the feed
 * of their activity events. Both queries apply the same server-side rule, so a
 * subject the viewer cannot see is the app's ordinary 404 — never a page that
 * confirms the account exists.
 *
 * Both filters live in the URL: `?workspace=<id>` and `?source=<source>`.
 */
export function PersonPage({ userId }: PersonPageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const person = api.person.get.useQuery({ userId }, { retry: false });

  // Only a shared workspace is a valid filter; anything else in the URL (a
  // stale or hand-typed id) falls back to every workspace.
  const requestedWorkspace = searchParams.get('workspace');
  const workspaceId =
    person.data?.sharedWorkspaces.find(
      (workspace) => workspace.id === requestedWorkspace,
    )?.id ?? null;

  const source = searchParams.get('source') ?? 'all';

  // Each filter lives in the URL; its default value is left out of it.
  function setParam(key: string, next: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === null) params.delete(key);
    else params.set(key, next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  if (person.error?.data?.code === 'NOT_FOUND') notFound();

  if (person.isLoading || !person.data) {
    return (
      <Container size="md" className="w-full py-8">
        <Stack gap="md">
          <Skeleton height={32} width="40%" />
          <Skeleton height={220} />
        </Stack>
      </Container>
    );
  }

  const name = person.data.user.name ?? 'Unnamed';

  return (
    <Container size="md" className="w-full py-8">
      <Stack gap="lg">
        <PersonHeader
          person={person.data}
          workspaceId={workspaceId}
          onWorkspaceChange={(next) => setParam('workspace', next)}
        />

        {/* Your own page only. The panel reads the signed-in user's digest and
            takes no subject, so it cannot show anyone else's (ADR-0018). */}
        {person.data.isSelf ? (
          <WeeklyWorkDigestPanel />
        ) : (
          // Someone else's page: a summary written only from what the viewer
          // can see in the feed below, never from that person's digest.
          <PersonWeekSummaryPanel userId={userId} name={name} />
        )}

        <PersonFeed
          userId={userId}
          name={name}
          workspaceId={workspaceId}
          source={source}
          onSourceChange={(next) =>
            setParam('source', next === 'all' ? null : next)
          }
        />
      </Stack>
    </Container>
  );
}
