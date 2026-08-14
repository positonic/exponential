"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { IconAlertTriangle, IconBrandGithub, IconSearch } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { suggestShortCode } from "~/lib/adr/shortCode";

/**
 * Decision Log enrolment (settings → decisions): bulk multi-select over the
 * workspace's tracked repos with auto-suggested short codes, ADR path probe,
 * and product assignment. Modeled on GithubRepositoriesCard (ADR-0020).
 */

interface RowState {
  enrolled: boolean;
  shortCode: string;
  /** Comma-separated in the input; split on save. */
  adrPaths: string;
}

export default function DecisionsSettingsPage() {
  const { workspace, workspaceId, userRole, isLoading } = useWorkspace();
  const isOwnerOrAdmin = userRole === "owner" || userRole === "admin";
  const utils = api.useUtils();

  const { data: connection, isLoading: reposLoading } =
    api.github.getGithubConnectionState.useQuery(
      { workspaceId: workspaceId ?? "" },
      { enabled: !!workspaceId },
    );
  const { data: configs, isLoading: configsLoading } =
    api.adr.listConfigs.useQuery(
      { workspaceId: workspaceId ?? "" },
      { enabled: !!workspaceId },
    );
  const { data: products } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId && isOwnerOrAdmin },
  );

  const repos = useMemo(() => connection?.repos ?? [], [connection?.repos]);
  const configByRepoId = useMemo(
    () => new Map((configs ?? []).map((c) => [c.repositoryId, c])),
    [configs],
  );

  // Per-repo editable row state, seeded once from configs + suggestions.
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || reposLoading || configsLoading || repos.length === 0)
      return;
    const taken = new Set((configs ?? []).map((c) => c.shortCode));
    const next: Record<string, RowState> = {};
    for (const repo of repos) {
      const config = configByRepoId.get(repo.id);
      if (config) {
        next[repo.id] = {
          enrolled: config.enabled,
          shortCode: config.shortCode,
          adrPaths: config.adrPaths.join(", "),
        };
      } else {
        const suggestion = suggestShortCode(repo.name, taken);
        taken.add(suggestion);
        next[repo.id] = {
          enrolled: false,
          shortCode: suggestion,
          adrPaths: "docs/adr",
        };
      }
    }
    setRows(next);
    seeded.current = true;
  }, [repos, configs, configByRepoId, reposLoading, configsLoading]);

  const updateRow = (repoId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [repoId]: { ...(prev[repoId] ?? { enrolled: false, shortCode: "", adrPaths: "docs/adr" }), ...patch },
    }));
  };

  // Path probe results, keyed by repo id.
  const [probeResults, setProbeResults] = useState<
    Record<string, Array<{ path: string; exists: boolean; markdownCount: number }>>
  >({});
  const probe = api.adr.probePaths.useMutation({
    onError: (error) =>
      notifications.show({ title: "Probe failed", message: error.message, color: "red" }),
  });
  const [probingRepoId, setProbingRepoId] = useState<string | null>(null);

  const upsert = api.adr.upsertConfigs.useMutation({
    onSuccess: async () => {
      notifications.show({
        title: "Saved",
        message: "ADR sync enrolment updated.",
        color: "green",
      });
      await utils.adr.listConfigs.invalidate();
      await utils.adr.list.invalidate();
    },
    onError: (error) =>
      notifications.show({ title: "Couldn't save", message: error.message, color: "red" }),
  });

  const disable = api.adr.disableConfig.useMutation({
    onSuccess: async () => {
      notifications.show({
        title: "Disabled",
        message: "Sync disabled. Synced decisions and links are retained.",
        color: "green",
      });
      await utils.adr.listConfigs.invalidate();
    },
    onError: (error) =>
      notifications.show({ title: "Couldn't disable", message: error.message, color: "red" }),
  });

  const setProduct = api.adr.setRepositoryProduct.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.adr.listConfigs.invalidate(),
        utils.github.getGithubConnectionState.invalidate(),
      ]);
    },
    onError: (error) =>
      notifications.show({ title: "Couldn't assign product", message: error.message, color: "red" }),
  });

  if (isLoading || reposLoading || configsLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={280} mb="lg" />
        <Skeleton height={320} />
      </Container>
    );
  }

  if (!workspace) {
    return (
      <Container size="xl" className="py-8">
        <Text className="text-text-secondary">Workspace not found</Text>
      </Container>
    );
  }

  if (!isOwnerOrAdmin) {
    return (
      <Container size="xl" className="py-8">
        <Title order={2} mb="sm">
          Decision sync
        </Title>
        <Text size="sm" className="text-text-secondary">
          Only workspace owners and admins can manage ADR sync enrolment.
        </Text>
      </Container>
    );
  }

  const handleSave = () => {
    if (!workspaceId) return;
    const enrolledConfigs = repos
      .filter((repo) => rows[repo.id]?.enrolled)
      .map((repo) => {
        const row = rows[repo.id]!;
        return {
          repositoryId: repo.id,
          shortCode: row.shortCode.trim().toUpperCase(),
          adrPaths: row.adrPaths
            .split(",")
            .map((p) => p.trim().replace(/^\/+|\/+$/g, ""))
            .filter((p) => p.length > 0),
          enabled: true,
        };
      });
    if (enrolledConfigs.length === 0) {
      notifications.show({
        title: "Nothing to save",
        message: "Select at least one repository to enrol.",
        color: "yellow",
      });
      return;
    }
    upsert.mutate({ workspaceId, configs: enrolledConfigs });
  };

  const productOptions = (products ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <Container size="xl" className="py-8">
      <Group gap="sm" mb="xs">
        <IconBrandGithub size={22} className="text-text-primary" />
        <Title order={2}>Decision sync</Title>
      </Group>
      <Text size="sm" className="text-text-secondary" mb="lg">
        Project ADR markdown files from this workspace&apos;s tracked GitHub
        repos into the Decision Log. Read-only — git stays the source of truth.
      </Text>

      <Alert
        icon={<IconAlertTriangle size={16} />}
        color="yellow"
        variant="light"
        mb="lg"
        title="Visibility"
      >
        ADR content from enrolled repositories becomes readable by all members
        of this workspace — including members who cannot access the repository
        on GitHub.
      </Alert>

      {repos.length === 0 ? (
        <Text size="sm" className="text-text-secondary">
          No tracked repositories. Add repositories under workspace integrations
          first.
        </Text>
      ) : (
        <Paper p="lg" withBorder className="bg-surface-secondary">
          <Stack gap="md">
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Sync</Table.Th>
                  <Table.Th>Repository</Table.Th>
                  <Table.Th>Short code</Table.Th>
                  <Table.Th>ADR paths</Table.Th>
                  <Table.Th>Product</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {repos.map((repo) => {
                  const row = rows[repo.id];
                  const config = configByRepoId.get(repo.id);
                  const probed = probeResults[repo.id];
                  return (
                    <Table.Tr key={repo.id}>
                      <Table.Td>
                        <Checkbox
                          checked={row?.enrolled ?? false}
                          onChange={(e) => {
                            const enrolled = e.currentTarget.checked;
                            if (!enrolled && config?.enabled && workspaceId) {
                              disable.mutate({ workspaceId, configId: config.id });
                            }
                            updateRow(repo.id, { enrolled });
                          }}
                          aria-label={`Enrol ${repo.fullName}`}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          <Text size="sm" className="text-text-primary">
                            {repo.fullName}
                          </Text>
                          {config && !config.enabled ? (
                            <Badge size="xs" variant="light" color="gray">
                              disabled — data retained
                            </Badge>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <TextInput
                          size="xs"
                          w={110}
                          value={row?.shortCode ?? ""}
                          onChange={(e) =>
                            updateRow(repo.id, {
                              shortCode: e.currentTarget.value.toUpperCase(),
                            })
                          }
                          disabled={!row?.enrolled}
                          aria-label={`Short code for ${repo.fullName}`}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={4}>
                          <Group gap="xs" wrap="nowrap">
                            <TextInput
                              size="xs"
                              w={200}
                              value={row?.adrPaths ?? ""}
                              onChange={(e) =>
                                updateRow(repo.id, { adrPaths: e.currentTarget.value })
                              }
                              disabled={!row?.enrolled}
                              placeholder="docs/adr"
                              aria-label={`ADR paths for ${repo.fullName}`}
                            />
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="gray"
                              leftSection={<IconSearch size={12} />}
                              loading={probe.isPending && probingRepoId === repo.id}
                              disabled={!row?.enrolled || !workspaceId}
                              onClick={() => {
                                if (!workspaceId || !row) return;
                                setProbingRepoId(repo.id);
                                probe.mutate(
                                  {
                                    workspaceId,
                                    repositoryId: repo.id,
                                    adrPaths: row.adrPaths
                                      .split(",")
                                      .map((p) => p.trim())
                                      .filter((p) => p.length > 0),
                                  },
                                  {
                                    onSuccess: (result) =>
                                      setProbeResults((prev) => ({
                                        ...prev,
                                        [repo.id]: result,
                                      })),
                                    onSettled: () => setProbingRepoId(null),
                                  },
                                );
                              }}
                            >
                              Probe
                            </Button>
                          </Group>
                          {probed ? (
                            <Group gap={6}>
                              {probed.map((p) => (
                                <Badge
                                  key={p.path}
                                  size="xs"
                                  variant="light"
                                  color={p.exists ? "green" : "red"}
                                >
                                  {p.path}:{" "}
                                  {p.exists ? `${p.markdownCount} files` : "not found"}
                                </Badge>
                              ))}
                            </Group>
                          ) : null}
                        </Stack>
                      </Table.Td>
                      <Table.Td>
                        <Select
                          size="xs"
                          w={180}
                          data={productOptions}
                          value={repo.productId ?? null}
                          placeholder="Workspace-level"
                          clearable
                          onChange={(value) => {
                            if (!workspaceId) return;
                            setProduct.mutate({
                              workspaceId,
                              repositoryId: repo.id,
                              productId: value,
                            });
                          }}
                          aria-label={`Product for ${repo.fullName}`}
                        />
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>

            <Group>
              <Button
                variant="filled"
                color="brand"
                size="sm"
                loading={upsert.isPending}
                onClick={handleSave}
              >
                Save enrolment
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
    </Container>
  );
}
