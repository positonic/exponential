"use client";

import { useEffect, useRef, useState } from "react";
import {
  Paper,
  Title,
  Text,
  Stack,
  Group,
  Button,
  Checkbox,
  Badge,
  Skeleton,
} from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";

/**
 * `/integrations` GitHub card (ADR-0020, slice #3). Renders by connection state
 * (from `getGithubConnectionState`) and lets owners/admins pick which accessible
 * repos the workspace tracks. Plain members see the tracked list read-only.
 */
export function GithubRepositoriesCard() {
  const { workspaceId, userRole } = useWorkspace();
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";
  const utils = api.useUtils();

  const { data: connection, isLoading } =
    api.github.getGithubConnectionState.useQuery(
      { workspaceId: workspaceId ?? "" },
      { enabled: !!workspaceId },
    );

  const state = connection?.state;
  const showRepoPicker = state === "NO_REPOS" || state === "CONNECTED";

  const { data: accessibleRepos } = api.github.listAccessibleRepos.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId && isOwnerOrAdmin && showRepoPicker },
  );

  // Selection state, seeded once from the currently-tracked repos.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current && connection?.repos) {
      setSelected(new Set(connection.repos.map((r) => r.fullName)));
      seeded.current = true;
    }
  }, [connection?.repos]);

  const setRepos = api.github.setWorkspaceRepositories.useMutation({
    onSuccess: async () => {
      notifications.show({
        title: "Saved",
        message: "GitHub repositories updated.",
        color: "green",
      });
      await Promise.all([
        utils.github.getGithubConnectionState.invalidate(),
        utils.github.listAccessibleRepos.invalidate(),
      ]);
    },
    onError: (error) => {
      notifications.show({
        title: "Couldn't save",
        message: error.message,
        color: "red",
      });
    },
  });

  function toggle(fullName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      return next;
    });
  }

  const header = (
    <Group gap="sm">
      <IconBrandGithub size={20} className="text-text-primary" />
      <Title order={4} className="text-text-primary">
        GitHub Repositories
      </Title>
    </Group>
  );

  function Body() {
    if (isLoading || !state) {
      return <Skeleton height={80} />;
    }

    if (state === "NOT_CONFIGURED") {
      return (
        <Text size="sm" className="text-text-secondary">
          GitHub isn&apos;t set up on this deployment yet. Once an administrator
          configures the GitHub App, you&apos;ll be able to connect repositories
          here.
        </Text>
      );
    }

    if (state === "NOT_INSTALLED") {
      if (!isOwnerOrAdmin) {
        return (
          <Text size="sm" className="text-text-secondary">
            GitHub isn&apos;t connected for this workspace yet.
          </Text>
        );
      }
      return (
        <Stack gap="sm" align="flex-start">
          <Text size="sm" className="text-text-secondary">
            Install the GitHub App to choose which repositories this workspace
            tracks.
          </Text>
          <Button
            component="a"
            href={`/api/auth/github/authorize?workspaceId=${workspaceId ?? ""}`}
            variant="filled"
            color="brand"
            size="sm"
            leftSection={<IconBrandGithub size={16} />}
          >
            Install GitHub App
          </Button>
        </Stack>
      );
    }

    // NO_REPOS or CONNECTED
    if (!isOwnerOrAdmin) {
      const tracked = connection?.repos ?? [];
      if (tracked.length === 0) {
        return (
          <Text size="sm" className="text-text-secondary">
            No repositories are being tracked yet.
          </Text>
        );
      }
      return (
        <Stack gap="xs">
          {tracked.map((repo) => (
            <Group key={repo.id} gap="xs">
              <Text size="sm" className="text-text-primary">
                {repo.fullName}
              </Text>
            </Group>
          ))}
        </Stack>
      );
    }

    const repos = accessibleRepos ?? [];
    return (
      <Stack gap="md">
        <Text size="sm" className="text-text-secondary">
          Select the repositories this workspace should track.
        </Text>
        {repos.length === 0 ? (
          <Text size="sm" className="text-text-secondary">
            No accessible repositories found for this installation.
          </Text>
        ) : (
          <Stack gap="xs">
            {repos.map((repo) => (
              <Checkbox
                key={repo.fullName}
                checked={selected.has(repo.fullName)}
                onChange={() => toggle(repo.fullName)}
                label={
                  <Group gap="xs" wrap="nowrap">
                    <Text size="sm" className="text-text-primary">
                      {repo.fullName}
                    </Text>
                    <Badge size="xs" variant="light" color={repo.private ? "gray" : "brand"}>
                      {repo.private ? "Private" : "Public"}
                    </Badge>
                  </Group>
                }
              />
            ))}
          </Stack>
        )}
        <Group>
          <Button
            variant="filled"
            color="brand"
            size="sm"
            loading={setRepos.isPending}
            disabled={!workspaceId}
            onClick={() =>
              setRepos.mutate({
                workspaceId: workspaceId ?? "",
                fullNames: [...selected],
              })
            }
          >
            Save
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Paper p="lg" withBorder className="bg-surface-secondary">
      <Stack gap="md">
        {header}
        <Body />
      </Stack>
    </Paper>
  );
}
