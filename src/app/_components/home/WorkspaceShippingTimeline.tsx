'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Center,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Timeline,
  Title,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconBrandGithub,
  IconGitCommit,
  IconGitMerge,
} from '@tabler/icons-react';
import { format, startOfDay } from 'date-fns';
import { api } from '~/trpc/react';
import { useWorkspace } from '~/providers/WorkspaceProvider';
import {
  COMMIT_CATEGORIES,
  parseCommitMessage,
  summarizeByCategory,
  isMergeCommit,
  type CommitCategory,
} from '~/lib/changelog/commitCategories';

type TimelineItem = {
  id: string;
  kind: 'pull_request' | 'push';
  occurredAt: Date;
  repoFullName: string;
  repoUrl: string | null;
  title: string;
  url: string | null;
  author: string | null;
  branchName: string | null;
  prNumber: number | null;
  commitCount: number | null;
};

interface DayGroup {
  date: Date;
  items: TimelineItem[];
}

/**
 * Group into local calendar days. Deliberately client-side and local-time, the
 * same as the public product timeline — "what shipped Tuesday" means the
 * reader's Tuesday, and grouping server-side in UTC would split a late evening
 * of work across two headings for anyone west of Greenwich.
 */
function groupByDay(items: TimelineItem[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const item of items) {
    const day = startOfDay(item.occurredAt);
    const key = day.toISOString();
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { date: day, items: [item] });
  }
  return Array.from(groups.values()).sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}

function categoryOf(item: TimelineItem): CommitCategory {
  return parseCommitMessage(item.title).category;
}

/**
 * `/w/[workspaceSlug]/product-timeline` — what this workspace shipped, across
 * every repo it tracks.
 *
 * Reads stored GitHub activity rather than calling GitHub live, so it is
 * workspace-scoped, spans every tracked repo, and does not blank out when a
 * `GITHUB_TOKEN` expires. The trade-off is that it can only show what was
 * ingested — hence the explicit "tracked repos" line and the unconfigured
 * state, so an incomplete timeline never silently reads as a complete one.
 */
export function WorkspaceShippingTimeline() {
  const { workspaceId, isLoading: workspaceLoading } = useWorkspace();
  const [days, setDays] = useState('30');
  const [repo, setRepo] = useState<string | null>(null);

  const { data, isLoading } = api.workspace.getWorkspaceTimeline.useQuery(
    {
      workspaceId: workspaceId!,
      days: Number(days),
      ...(repo ? { repoFullName: repo } : {}),
    },
    { enabled: !!workspaceId },
  );

  const groups = useMemo(
    () =>
      groupByDay(
        (data?.items ?? []).map((item) => ({
          ...item,
          occurredAt: new Date(item.occurredAt),
        })),
      ),
    [data?.items],
  );

  if (workspaceLoading || isLoading) {
    return (
      <Center h={240}>
        <Loader size="sm" />
      </Center>
    );
  }

  const trackedRepos = data?.trackedRepos ?? [];

  return (
    <Stack gap="lg" p="md">
      <div>
        <Title order={2} c="var(--color-text-primary)">
          Shipped
        </Title>
        <Text size="sm" c="var(--color-text-muted)">
          Merged pull requests and commits across this workspace&apos;s repos.
        </Text>
      </div>

      {data?.isUnconfigured ? (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          color="yellow"
          title="No repositories connected"
        >
          This workspace isn&apos;t tracking any GitHub repositories, so nothing
          can appear here. Connect them in{' '}
          <Anchor href="/settings/integrations" size="sm">
            Settings → Integrations
          </Anchor>
          . Until a repo is registered, its webhooks are received and discarded.
        </Alert>
      ) : null}

      <Group gap="sm" align="flex-end">
        <Select
          label="Period"
          size="xs"
          w={140}
          value={days}
          onChange={(value) => setDays(value ?? '30')}
          data={[
            { value: '7', label: 'Last 7 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
          ]}
          allowDeselect={false}
        />
        {trackedRepos.length > 1 ? (
          <Select
            label="Repository"
            size="xs"
            w={260}
            value={repo}
            onChange={setRepo}
            placeholder="All repositories"
            clearable
            data={trackedRepos.map((r) => ({ value: r, label: r }))}
          />
        ) : null}
      </Group>

      {trackedRepos.length > 0 ? (
        <Text size="xs" c="var(--color-text-muted)">
          Tracking {trackedRepos.length}{' '}
          {trackedRepos.length === 1 ? 'repository' : 'repositories'}:{' '}
          {trackedRepos.join(', ')}
        </Text>
      ) : null}

      {groups.length === 0 && !data?.isUnconfigured ? (
        <Alert color="gray" icon={<IconBrandGithub size={16} />}>
          Nothing recorded in this period. If work did ship, the webhook may not
          be reaching this workspace — check Recent Deliveries on the GitHub App.
        </Alert>
      ) : null}

      <Timeline
        active={groups.length}
        bulletSize={22}
        lineWidth={2}
        color="var(--color-brand-primary)"
      >
        {groups.map((group) => {
          const merged = group.items.filter(
            (item) => item.kind === 'pull_request',
          );
          const commits = group.items.filter((item) => item.kind === 'push');
          const summary = summarizeByCategory(
            group.items.map((item) => ({ message: item.title })),
          );

          return (
            <Timeline.Item
              key={group.date.toISOString()}
              bullet={
                merged.length > 0 ? (
                  <IconGitMerge size={12} />
                ) : (
                  <IconGitCommit size={12} />
                )
              }
              title={
                <Group gap="xs">
                  <Text fw={600} size="sm" c="var(--color-text-primary)">
                    {format(group.date, 'EEEE, d MMMM yyyy')}
                  </Text>
                  {merged.length > 0 ? (
                    <Badge size="xs" variant="light" color="green">
                      {merged.length} merged
                    </Badge>
                  ) : null}
                  {commits.length > 0 ? (
                    <Badge size="xs" variant="light" color="gray">
                      {commits.length}{' '}
                      {commits.length === 1 ? 'commit' : 'commits'}
                    </Badge>
                  ) : null}
                </Group>
              }
            >
              <Group gap={4} mb="xs">
                {summary.slice(0, 4).map(({ category, count }) => (
                  <Badge
                    key={category}
                    size="xs"
                    variant="dot"
                    color={COMMIT_CATEGORIES[category].color}
                  >
                    {COMMIT_CATEGORIES[category].label} {count}
                  </Badge>
                ))}
              </Group>

              <Stack gap={6}>
                {/* Merged PRs first — they're the headline of a shipping day.
                    Merge commits are dropped from the commit list because the
                    PR they merged is already shown above them. */}
                {merged.map((item) => (
                  <TimelineRow key={item.id} item={item} />
                ))}
                {commits
                  .filter((item) => !isMergeCommit(item.title))
                  .map((item) => (
                    <TimelineRow key={item.id} item={item} />
                  ))}
              </Stack>
            </Timeline.Item>
          );
        })}
      </Timeline>

      {data && data.items.length >= 500 ? (
        <Text size="xs" c="var(--color-text-muted)">
          Showing the most recent 500 events — narrow the period or pick a
          single repository to see the rest.
        </Text>
      ) : null}
    </Stack>
  );
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const { text } = parseCommitMessage(item.title);
  const category = categoryOf(item);

  return (
    <Group gap="xs" wrap="nowrap" align="baseline">
      <Badge
        size="xs"
        variant="light"
        color={COMMIT_CATEGORIES[category].color}
        style={{ flexShrink: 0 }}
      >
        {COMMIT_CATEGORIES[category].label}
      </Badge>
      {item.url ? (
        <Anchor
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          size="sm"
          c="var(--color-text-primary)"
        >
          {text}
        </Anchor>
      ) : (
        <Text size="sm" c="var(--color-text-primary)">
          {text}
        </Text>
      )}
      <Text size="xs" c="var(--color-text-muted)" style={{ flexShrink: 0 }}>
        {item.prNumber ? `#${item.prNumber}` : null}
        {item.author ? ` ${item.author}` : null}
      </Text>
      <Text size="xs" c="var(--color-text-muted)" style={{ flexShrink: 0 }}>
        {item.repoFullName.split('/')[1] ?? item.repoFullName}
      </Text>
    </Group>
  );
}
