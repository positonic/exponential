'use client';

import { Container, Skeleton, Stack } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import {
  notFound,
  usePathname,
  useRouter,
  useSearchParams,
} from 'next/navigation';
import { api } from '~/trpc/react';
import {
  ActivityRow,
  type FeedRowEvent,
} from '~/app/_components/home/activity/activityRow';

import { PersonHeader } from './PersonHeader';

import '~/app/_components/home/activity/activity-home.css';

const PAGE_SIZE = 50;

interface PersonPageProps {
  userId: string;
}

/**
 * The Person page. Read-only: a header saying who the subject is and the feed
 * of their activity events. Both queries apply the same server-side rule, so a
 * subject the viewer cannot see is the app's ordinary 404 — never a page that
 * confirms the account exists.
 *
 * The workspace filter lives in the URL as `?workspace=<id>`.
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

  const feed = api.person.getFeed.useQuery(
    { userId, limit: PAGE_SIZE, workspaceId: workspaceId ?? undefined },
    { retry: false, enabled: person.isSuccess },
  );

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

  const { user } = person.data;
  const name = user.name ?? 'Unnamed';
  const events: FeedRowEvent[] = (feed.data?.events ?? []).map((event) => ({
    ...event,
    createdAt: new Date(event.createdAt),
  }));

  return (
    <Container size="md" className="w-full py-8">
      <Stack gap="lg">
        <PersonHeader
          person={person.data}
          workspaceId={workspaceId}
          onWorkspaceChange={(next) => setParam('workspace', next)}
        />

        <section className="wsa-card" aria-label={`${name}'s activity`}>
          <div className="wsa-card__head">
            <h2 className="wsa-card__title">
              <IconClipboardList size={14} stroke={1.8} />
              Activity
            </h2>
          </div>

          {feed.isLoading ? (
            <Stack gap="sm">
              <Skeleton height={36} />
              <Skeleton height={36} />
              <Skeleton height={36} />
            </Stack>
          ) : events.length === 0 ? (
            <p className="wsa-feed__empty">
              Nothing from {name} yet
              {workspaceId ? ' in this workspace' : ' in your workspaces'}.
            </p>
          ) : (
            events.map((event) => (
              <ActivityRow key={event.id} event={event} showWorkspaceBadge />
            ))
          )}
        </section>
      </Stack>
    </Container>
  );
}
