"use client";

import React, { useState, useCallback } from "react";
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
} from "@tabler/icons-react";
import type { GitHubCommit } from "~/server/services/githubService";
import classes from "./ProductTimeline.module.css";

const CATEGORY_CONFIG: Record<
  string,
  { color: string; label: string; icon: React.ReactNode }
> = {
  feat: {
    color: "blue",
    label: "Feature",
    icon: <IconSparkles size={12} />,
  },
  fix: { color: "green", label: "Fix", icon: <IconBug size={12} /> },
  chore: { color: "gray", label: "Chore", icon: <IconTool size={12} /> },
  docs: {
    color: "cyan",
    label: "Docs",
    icon: <IconFileText size={12} />,
  },
  refactor: {
    color: "violet",
    label: "Refactor",
    icon: <IconRefresh size={12} />,
  },
  style: { color: "pink", label: "Style", icon: <IconTool size={12} /> },
  test: { color: "yellow", label: "Test", icon: <IconTool size={12} /> },
  perf: {
    color: "orange",
    label: "Perf",
    icon: <IconSparkles size={12} />,
  },
  ci: { color: "gray", label: "CI", icon: <IconTool size={12} /> },
  build: { color: "gray", label: "Build", icon: <IconTool size={12} /> },
  update: {
    color: "gray",
    label: "Update",
    icon: <IconGitCommit size={12} />,
  },
};

function parseCommitMessage(message: string): {
  category: string;
  text: string;
} {
  const match = message.match(
    /^(feat|fix|chore|docs|refactor|style|test|perf|ci|build)(?:\(.+?\))?:\s*(.+)/i,
  );
  if (match) return { category: match[1]!.toLowerCase(), text: match[2]! };
  return { category: "update", text: message };
}

function getCategorySummary(
  commits: GitHubCommit[],
): { category: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    const { category } = parseCommitMessage(commit.message);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function getDominantColor(commits: GitHubCommit[]): string {
  const summary = getCategorySummary(commits);
  const dominant = summary[0]?.category ?? "update";
  return CATEGORY_CONFIG[dominant]?.color ?? "gray";
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

  const allCommits = queries.flatMap((q) => q.data?.commits ?? []);
  const lastQuery = queries[queries.length - 1];
  const isLoading = queries.some((q) => q.isLoading);
  const hasNextPage = lastQuery?.data?.hasNextPage ?? false;

  const loadMore = useCallback(() => {
    setPages((prev) => [...prev, (prev[prev.length - 1] ?? 0) + 1]);
  }, []);

  const groups = groupCommitsByDate(allCommits);

  if (isLoading && allCommits.length === 0) {
    return (
      <Container size="md" py="xl">
        <Center py="xl">
          <Loader />
        </Center>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Title order={1} mb="xs">
        Product Timeline
      </Title>
      <Text c="dimmed" mb="xl">
        Every change we make to Exponential, straight from our git history.
      </Text>

      <Timeline active={groups.length - 1} bulletSize={24} lineWidth={2}>
        {groups.map((group) => {
          const groupId = group.date.toISOString();
          const isExpanded = expandedGroups.has(groupId);
          const summary = getCategorySummary(group.commits);
          const dominantColor = getDominantColor(group.commits);

          return (
            <Timeline.Item
              key={groupId}
              bullet={
                <IconGitCommit
                  size={14}
                  style={{
                    color: `var(--mantine-color-${dominantColor}-4)`,
                  }}
                />
              }
              title={format(group.date, "PPP")}
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
                    {group.commits.length} update
                    {group.commits.length !== 1 ? "s" : ""}
                  </Text>
                  <Group gap={4}>
                    {summary.map(({ category, count }) => {
                      const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.update!;
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
                  {group.commits.map((commit) => {
                    const { category, text } = parseCommitMessage(
                      commit.message,
                    );
                    const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.update!;

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
