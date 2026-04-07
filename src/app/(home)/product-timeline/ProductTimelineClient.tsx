"use client";

import React, { useState, useCallback } from "react";
import {
  Timeline,
  Text,
  Stack,
  Anchor,
  Group,
  Avatar,
  Button,
  Container,
  Title,
  Loader,
  Center,
} from "@mantine/core";
import { api } from "~/trpc/react";
import { format, startOfDay } from "date-fns";
import { IconGitCommit, IconBrandGithub } from "@tabler/icons-react";
import type { GitHubCommit } from "~/server/services/githubService";
import classes from "./ProductTimeline.module.css";

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
        {groups.map((group) => (
          <Timeline.Item
            key={group.date.toISOString()}
            bullet={
              <IconGitCommit
                size={14}
                style={{ color: "var(--mantine-color-blue-4)" }}
              />
            }
            title={format(group.date, "PPP")}
            styles={{
              itemTitle: {
                fontWeight: 600,
              },
            }}
          >
            <Text size="xs" c="dimmed" mb={4}>
              {group.commits.length} commit
              {group.commits.length !== 1 ? "s" : ""}
            </Text>
            <Stack gap={4}>
              {group.commits.map((commit) => (
                <Group
                  key={commit.sha}
                  gap="xs"
                  wrap="nowrap"
                  className={classes.commitRow}
                >
                  {commit.avatarUrl && (
                    <Avatar src={commit.avatarUrl} size={20} radius="xl" />
                  )}
                  <Text size="sm" className={classes.commitMessage} lineClamp={1}>
                    {commit.message}
                  </Text>
                  <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
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
                      style={{ color: "var(--mantine-color-dimmed)" }}
                    />
                  </Anchor>
                </Group>
              ))}
            </Stack>
          </Timeline.Item>
        ))}
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
