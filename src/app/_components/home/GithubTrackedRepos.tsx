"use client";

import {
  Container,
  Paper,
  Title,
  Stack,
  Group,
  Badge,
  Anchor,
} from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import Link from "next/link";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

/**
 * Workspace-home panel listing the repos this workspace tracks (ADR-0020).
 * Read-only summary for everyone; self-hides when nothing is tracked (the
 * Connect CTA covers the not-yet-connected case instead). Links to
 * `/settings/integrations` to manage the selection.
 */
export function GithubTrackedRepos() {
  const { workspaceId } = useWorkspace();

  const { data } = api.github.getGithubConnectionState.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const repos = data?.repos ?? [];
  if (repos.length === 0) return null;

  return (
    <Container size="lg" className="pt-8">
      <Paper
        p="md"
        radius="md"
        className="border border-border-primary bg-surface-secondary"
      >
        <Stack gap="sm">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <IconBrandGithub size={20} className="text-text-primary" />
              <Title order={5} className="text-text-primary">
                GitHub Repositories
              </Title>
            </Group>
            <Anchor
              component={Link}
              href="/settings/integrations"
              size="xs"
              className="text-text-secondary"
            >
              Manage
            </Anchor>
          </Group>
          <Group gap="xs">
            {repos.map((repo) => (
              <Badge key={repo.id} variant="light" color="gray" size="sm">
                {repo.fullName}
              </Badge>
            ))}
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
