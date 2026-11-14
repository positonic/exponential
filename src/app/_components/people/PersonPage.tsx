'use client';

import { Container, Skeleton, Stack, Text, Title } from '@mantine/core';
import { IconClipboardList } from '@tabler/icons-react';
import { notFound } from 'next/navigation';
import { api } from '~/trpc/react';
import {
  ActivityRow,
  type FeedRowEvent,
} from '~/app/_components/home/activity/activityRow';

import '~/app/_components/home/activity/activity-home.css';

const PAGE_SIZE = 50;

interface PersonPageProps {
  userId: string;
}

/**
 * The Person page. Read-only: a header naming the subject and the feed of
 * their activity events. Both queries apply the same server-side rule, so a
 * subject the viewer cannot see is the app's ordinary 404 — never a page that
 * confirms the account exists.
 */
export function PersonPage({ userId }: PersonPageProps) {
  const person = api.person.get.useQuery({ userId }, { retry: false });
  const feed = api.person.getFeed.useQuery(
    { userId, limit: PAGE_SIZE },
    { retry: false, enabled: person.isSuccess },
  );

  if (person.error?.data?.code === 'NOT_FOUND') notFound();

  if (person.isLoading || !person.data) {
    return (
      <Container size="md" className="py-8">
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
    <Container size="md" className="py-8">
      <Stack gap="lg">
        <div>
          <Text
            size="xs"
            tt="uppercase"
            className="text-text-muted"
            style={{ letterSpacing: '0.08em' }}
          >
            Person
          </Text>
          <Title order={1} className="text-text-primary" mt={4}>
            {name}
          </Title>
        </div>

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
              Nothing from {name} yet in the workspaces you share.
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
