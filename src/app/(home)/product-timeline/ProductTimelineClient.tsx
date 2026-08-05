"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Timeline,
  Text,
  Stack,
  Anchor,
  Group,
  Avatar,
  Badge,
  Button,
  Collapse,
  Container,
  Title,
  Loader,
  Center,
  UnstyledButton,
  Alert,
} from "@mantine/core";
import { api } from "~/trpc/react";
import { format, startOfDay } from "date-fns";
import {
  IconGitCommit,
  IconBrandGithub,
  IconChevronRight,
  IconChevronDown,
  IconSparkles,
  IconBug,
  IconTool,
  IconFileText,
  IconRefresh,
  IconRocket,
  IconPlus,
  IconAlertTriangle,
} from "@tabler/icons-react";
import { reportHandledError } from "~/lib/reportHandledError";
import type {
  GitHubCommit,
  GitHubRelease,
} from "~/server/services/githubService";
import { ReleaseBody } from "./ReleaseBody";
import { PRODUCT_NAME } from "~/lib/brand";
import {
  parseCommitMessage,
  summarizeByCategory,
  COMMIT_CATEGORIES,
  type CommitCategory,
} from "~/lib/changelog/commitCategories";
import classes from "./ProductTimeline.module.css";

// Icons are presentation-only and stay in the client; the category taxonomy,
// labels, and colors come from the shared categorization helper so the timeline
// and the "What Shipped Today" digest never drift apart.
const CATEGORY_ICONS: Record<CommitCategory, React.ReactNode> = {
  feat: <IconSparkles size={12} />,
  fix: <IconBug size={12} />,
  perf: <IconSparkles size={12} />,
  docs: <IconFileText size={12} />,
  refactor: <IconRefresh size={12} />,
  style: <IconTool size={12} />,
  test: <IconTool size={12} />,
  chore: <IconTool size={12} />,
  ci: <IconTool size={12} />,
  build: <IconTool size={12} />,
  update: <IconGitCommit size={12} />,
};

function categoryConfig(category: string): {
  color: string;
  label: string;
  icon: React.ReactNode;
} {
  const key: CommitCategory =
    category in COMMIT_CATEGORIES ? (category as CommitCategory) : "update";
  return {
    color: COMMIT_CATEGORIES[key].color,
    label: COMMIT_CATEGORIES[key].label,
    icon: CATEGORY_ICONS[key],
  };
}

function getDominantColor(commits: GitHubCommit[]): string {
  const summary = summarizeByCategory(commits);
  const dominant = summary[0]?.category ?? "update";
  return categoryConfig(dominant).color;
}

function groupCommitsByDate(
  commits: GitHubCommit[],
): { date: Date; commits: GitHubCommit[] }[] {
  const groups = new Map<string, { date: Date; commits: GitHubCommit[] }>();

  for (const commit of commits) {
    if (!commit.date) continue;
    const day = startOfDay(new Date(commit.date));
    const key = day.toISOString();
    const existing = groups.get(key);
    if (existing) {
      existing.commits.push(commit);
    } else {
      groups.set(key, { date: day, commits: [commit] });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}

type TimelineEntry =
  | { type: "release"; sortAt: number; release: GitHubRelease }
  | {
      type: "commit-group";
      sortAt: number;
      date: Date;
      commits: GitHubCommit[];
    };

function buildTimeline(
  commits: GitHubCommit[],
  releases: GitHubRelease[],
): TimelineEntry[] {
  const commitGroups = groupCommitsByDate(commits);
  const entries: TimelineEntry[] = [];

  for (const group of commitGroups) {
    entries.push({
      type: "commit-group",
      sortAt: group.date.getTime(),
      date: group.date,
      commits: group.commits,
    });
  }

  for (const release of releases) {
    if (!release.publishedAt) continue;
    // Releases sort slightly after their day's commits so they appear above
    // that day's commit group (the list is sorted desc by sortAt).
    const published = new Date(release.publishedAt).getTime();
    entries.push({
      type: "release",
      sortAt: published + 1,
      release,
    });
  }

  return entries.sort((a, b) => b.sortAt - a.sortAt);
}

export function ProductTimelineClient() {
  const [pages, setPages] = useState([1]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(),
  );

  const toggleGroup = useCallback((groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const queries = pages.map((page) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    api.github.listCommits.useQuery({
      page,
      perPage: 100,
      owner: "positonic",
      repo: "exponential",
      branch: "main",
    }),
  );

  const releasesQuery = api.github.listReleases.useQuery({
    owner: "positonic",
    repo: "exponential",
    perPage: 30,
  });

  const allCommits = queries.flatMap((q) => q.data?.commits ?? []);
  const releases = releasesQuery.data ?? [];
  const lastQuery = queries[queries.length - 1];
  const isLoading = queries.some((q) => q.isLoading);
  const hasNextPage = lastQuery?.data?.hasNextPage ?? false;

  // The commit feed is the page; releases only decorate it. So a failed commit
  // fetch is fatal to the view while a failed release fetch is not — but both
  // get reported, because the failure mode that hid this page for days was an
  // expired GITHUB_TOKEN rendering as a silent empty timeline.
  const commitsErrorMessage =
    queries.find((q) => q.error)?.error?.message ?? null;
  const releasesErrorMessage = releasesQuery.error?.message ?? null;

  // `error` alone is not enough. A query can also come to rest at
  // `status: "pending" / fetchStatus: "paused"` — no data, no error, and
  // `isLoading` false, because React Query only reports `isLoading` while a
  // fetch is actually in flight. Nothing is pending and nothing failed, so
  // every guard keyed on `error` or `isLoading` falls through and the timeline
  // renders empty. That is indistinguishable, on screen, from "we shipped
  // nothing" — which is the bug this page had. Treat "no commits and nobody is
  // working on it" as a failure regardless of which state produced it.
  const isFetchingCommits = queries.some((q) => q.fetchStatus === "fetching");
  // `settled` keeps this from firing on the very first render, before the
  // fetch has been dispatched: a query that has never run is not a failure.
  const commitsSettled = queries.some(
    (q) => q.isFetched || q.fetchStatus === "paused",
  );
  const commitsUnavailable =
    allCommits.length === 0 &&
    !isLoading &&
    !isFetchingCommits &&
    commitsSettled;

  // Report the silent variant too. If we only reported `error`, the state that
  // actually hid this page — settled, empty, no error — would still reach the
  // user as a polite message and reach us as nothing at all.
  const commitsFailure =
    commitsErrorMessage ??
    (commitsUnavailable
      ? "Commit history unavailable: query settled with no data and no error"
      : null);

  useEffect(() => {
    if (!commitsFailure) return;
    reportHandledError(new Error(commitsFailure), {
      area: "product-timeline-commits",
      context: { repo: "positonic/exponential", branch: "main" },
    });
  }, [commitsFailure]);

  useEffect(() => {
    if (!releasesErrorMessage) return;
    reportHandledError(new Error(releasesErrorMessage), {
      area: "product-timeline-releases",
      context: { repo: "positonic/exponential" },
    });
  }, [releasesErrorMessage]);

  const loadMore = useCallback(() => {
    setPages((prev) => [...prev, (prev[prev.length - 1] ?? 0) + 1]);
  }, []);

  // Not memoized: these close over the per-page query handles, which change
  // with `pages`, and they only ever render on an error path.

  // Partial failure: we still have commits on screen, so refetch in place
  // rather than throwing away the pages the reader already has.
  const retryInPlace = () => {
    for (const query of queries) void query.refetch();
    void releasesQuery.refetch();
  };

  // Total failure: there is nothing on screen to preserve, and `refetch()` is
  // not dependable here — a query that came to rest at `fetchStatus: "paused"`
  // just pauses again, leaving the button looking broken. A reload always does
  // something, and costs nothing when the page is already empty.
  const retryFromScratch = () => {
    window.location.reload();
  };

  const entries = buildTimeline(allCommits, releases);

  if (isLoading && allCommits.length === 0) {
    return (
      <Container size="md" py="xl">
        <Center py="xl">
          <Loader />
        </Center>
      </Container>
    );
  }

  // Nothing to show and nothing in flight: say so, rather than rendering an
  // empty timeline that reads as "we shipped nothing".
  if (commitsUnavailable) {
    return (
      <Container size="md" py="xl">
        <Title order={1}>Product Timeline</Title>
        <Text c="dimmed" mb="xl">
          Every change we make to {PRODUCT_NAME}, straight from our git history.
        </Text>
        <Alert
          variant="light"
          color="red"
          icon={<IconAlertTriangle size={16} />}
          title="Couldn't load the timeline"
        >
          <Stack gap="sm" align="flex-start">
            <Text size="sm">
              We couldn&apos;t reach GitHub to read our commit history. This is
              our problem, not yours — the timeline itself is fine.
            </Text>
            {commitsErrorMessage && (
              <Text size="xs" c="dimmed">
                {commitsErrorMessage}
              </Text>
            )}
            <Button
              variant="light"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={retryFromScratch}
            >
              Try again
            </Button>
          </Stack>
        </Alert>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Group justify="space-between" align="flex-start" mb="xs">
        <Title order={1}>Product Timeline</Title>
        <Anchor
          href="https://github.com/positonic/exponential/releases/new"
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: "none" }}
        >
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlus size={14} />}
          >
            Draft release
          </Button>
        </Anchor>
      </Group>
      <Text c="dimmed" mb="xl">
        Every change we make to {PRODUCT_NAME}, straight from our git history.
      </Text>

      {/* Partial failure: we have commits to show, but a later page or the
          release list didn't load. Say what's missing instead of quietly
          rendering a shorter timeline. */}
      {(commitsErrorMessage ?? releasesErrorMessage) && (
        <Alert
          variant="light"
          color="yellow"
          icon={<IconAlertTriangle size={16} />}
          mb="lg"
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Text size="sm">
              {commitsErrorMessage
                ? "Some commits couldn't be loaded, so this timeline is incomplete."
                : "Releases couldn't be loaded, so only commits are shown."}
            </Text>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              onClick={retryInPlace}
            >
              Retry
            </Button>
          </Group>
        </Alert>
      )}

      <Timeline active={entries.length - 1} bulletSize={24} lineWidth={2}>
        {entries.map((entry) => {
          if (entry.type === "release") {
            const { release } = entry;
            return (
              <Timeline.Item
                key={`release-${release.id}`}
                bullet={
                  <IconRocket
                    size={14}
                    style={{ color: "var(--mantine-color-brand-4)" }}
                  />
                }
                title={
                  <Group gap="xs" align="center">
                    <Text fw={700}>{release.name}</Text>
                    <Badge size="xs" variant="light" color="brand">
                      {release.tagName}
                    </Badge>
                  </Group>
                }
                styles={{ itemTitle: { fontWeight: 600 } }}
              >
                <Text size="xs" c="dimmed" mb="xs">
                  {format(new Date(release.publishedAt), "PPP")}
                </Text>
                <ReleaseBody markdown={release.body} />
                <Anchor
                  href={release.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  size="xs"
                >
                  <Group gap={4} align="center">
                    <IconBrandGithub size={12} />
                    <span>View on GitHub</span>
                  </Group>
                </Anchor>
              </Timeline.Item>
            );
          }

          const groupId = entry.date.toISOString();
          const isExpanded = expandedGroups.has(groupId);
          const summary = summarizeByCategory(entry.commits);
          const dominantColor = getDominantColor(entry.commits);

          return (
            <Timeline.Item
              key={`commits-${groupId}`}
              bullet={
                <IconGitCommit
                  size={14}
                  style={{
                    color: `var(--mantine-color-${dominantColor}-4)`,
                  }}
                />
              }
              title={format(entry.date, "PPP")}
              styles={{
                itemTitle: {
                  fontWeight: 600,
                },
              }}
            >
              <UnstyledButton
                onClick={() => toggleGroup(groupId)}
                className={classes.toggleButton}
              >
                <Group gap={6} align="center">
                  {isExpanded ? (
                    <IconChevronDown size={14} />
                  ) : (
                    <IconChevronRight size={14} />
                  )}
                  <Text size="sm" className={classes.toggleText}>
                    {entry.commits.length} update
                    {entry.commits.length !== 1 ? "s" : ""}
                  </Text>
                  <Group gap={4}>
                    {summary.map(({ category, count }) => {
                      const config = categoryConfig(category);
                      return (
                        <Badge
                          key={category}
                          size="xs"
                          variant="light"
                          color={config.color}
                          leftSection={config.icon}
                        >
                          {count} {config.label.toLowerCase()}
                          {count !== 1 ? "s" : ""}
                        </Badge>
                      );
                    })}
                  </Group>
                </Group>
              </UnstyledButton>

              <Collapse in={isExpanded}>
                <Stack gap={4} mt="xs">
                  {entry.commits.map((commit) => {
                    const { category, text } = parseCommitMessage(
                      commit.message,
                    );
                    const config = categoryConfig(category);

                    return (
                      <Group
                        key={commit.sha}
                        gap="xs"
                        wrap="nowrap"
                        className={classes.commitRow}
                      >
                        {commit.avatarUrl && (
                          <Avatar
                            src={commit.avatarUrl}
                            size={20}
                            radius="xl"
                          />
                        )}
                        <Badge
                          size="xs"
                          variant="light"
                          color={config.color}
                          style={{ flexShrink: 0 }}
                        >
                          {config.label}
                        </Badge>
                        <Text
                          size="sm"
                          className={classes.commitMessage}
                          lineClamp={1}
                        >
                          {text}
                        </Text>
                        <Text
                          size="xs"
                          c="dimmed"
                          style={{ flexShrink: 0 }}
                        >
                          {commit.sha}
                        </Text>
                        <Anchor
                          href={commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ flexShrink: 0 }}
                        >
                          <IconBrandGithub
                            size={14}
                            style={{
                              color: "var(--mantine-color-dimmed)",
                            }}
                          />
                        </Anchor>
                      </Group>
                    );
                  })}
                </Stack>
              </Collapse>
            </Timeline.Item>
          );
        })}
      </Timeline>

      {hasNextPage && (
        <Center mt="lg">
          <Button
            variant="subtle"
            onClick={loadMore}
            loading={lastQuery?.isLoading}
          >
            Load More
          </Button>
        </Center>
      )}
    </Container>
  );
}
