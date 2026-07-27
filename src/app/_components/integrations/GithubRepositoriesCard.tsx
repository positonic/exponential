"use client";

import { useEffect, useRef, useState } from "react";
import {
  Paper,
  Title,
  Text,
  Stack,
  Group,
  Button,
  MultiSelect,
  Anchor,
  Badge,
  Skeleton,
} from "@mantine/core";
import { IconBrandGithub, IconRefresh } from "@tabler/icons-react";
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

  const refreshRepos = api.github.refreshAccessibleRepos.useMutation({
    onSuccess: async (repos) => {
      notifications.show({
        title: "Refreshed",
        message: `Found ${repos.length} accessible ${repos.length === 1 ? "repository" : "repositories"}.`,
        color: "green",
      });
      await utils.github.listAccessibleRepos.invalidate();
    },
    onError: (error) => {
      notifications.show({
        title: "Couldn't refresh",
        message: error.message,
        color: "red",
      });
    },
  });

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
    const repoByFullName = new Map(repos.map((r) => [r.fullName, r]));

    return (
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Text size="sm" className="text-text-secondary">
            Search and select the repositories this workspace should track.
          </Text>
          <Button
            variant="subtle"
            color="gray"
            size="compact-sm"
            leftSection={<IconRefresh size={14} />}
            loading={refreshRepos.isPending}
            disabled={!workspaceId}
            onClick={() =>
              refreshRepos.mutate({ workspaceId: workspaceId ?? "" })
            }
          >
            Refresh
          </Button>
        </Group>

        <MultiSelect
          data={repos.map((repo) => ({
            value: repo.fullName,
            label: repo.fullName,
          }))}
          value={[...selected]}
          onChange={(values) => setSelected(new Set(values))}
          searchable
          clearable
          hidePickedOptions
          placeholder={selected.size > 0 ? undefined : "Search repositories…"}
          nothingFoundMessage="No matching repositories"
          maxDropdownHeight={280}
          renderOption={({ option }) => {
            const repo = repoByFullName.get(option.value);
            return (
              <Group gap="xs" justify="space-between" wrap="nowrap" w="100%">
                <Text size="sm" className="text-text-primary">
                  {option.label}
                </Text>
                {repo ? (
                  <Badge
                    size="xs"
                    variant="light"
                    color={repo.private ? "gray" : "brand"}
                  >
                    {repo.private ? "Private" : "Public"}
                  </Badge>
                ) : null}
              </Group>
            );
          }}
        />

        <Text size="xs" className="text-text-muted">
          Don&apos;t see a repository? Grant the GitHub App access to it, then{" "}
          <Anchor
            href={`/api/auth/github/authorize?workspaceId=${workspaceId ?? ""}`}
            className="text-text-secondary"
          >
            manage repository access on GitHub
          </Anchor>{" "}
          or hit Refresh.
        </Text>

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
