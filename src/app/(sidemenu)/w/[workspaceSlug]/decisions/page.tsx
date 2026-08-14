"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Container,
  Group,
  MultiSelect,
  Select,
  Skeleton,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconSearch } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import Link from "next/link";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";

/**
 * Decision Log — workspace-level index of ADRs projected read-only from every
 * enrolled repo. Git is the source of truth; there is deliberately no write
 * path to ADR content anywhere in this UI.
 */

const STATUS_COLOR: Record<string, string> = {
  PROPOSED: "blue",
  ACCEPTED: "green",
  SUPERSEDED: "orange",
  DEPRECATED: "red",
};

const STATUS_OPTIONS = [
  { value: "PROPOSED", label: "Proposed" },
  { value: "ACCEPTED", label: "Accepted" },
  { value: "SUPERSEDED", label: "Superseded" },
  { value: "DEPRECATED", label: "Deprecated" },
  { value: "UNKNOWN", label: "No status" },
] as const;

type AdrStatusValue = (typeof STATUS_OPTIONS)[number]["value"];

function StatusChip({ status, statusRaw }: { status: string; statusRaw: string | null }) {
  if (status === "UNKNOWN") {
    return (
      <Badge variant="light" color="gray" title={statusRaw ?? undefined}>
        no status
      </Badge>
    );
  }
  return (
    <Badge variant="light" color={STATUS_COLOR[status] ?? "gray"} title={statusRaw ?? undefined}>
      {status.toLowerCase()}
    </Badge>
  );
}

export default function DecisionsPage() {
  const { workspace, workspaceId, isLoading } = useWorkspace();

  const [repoFilter, setRepoFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);

  const {
    data: adrs,
    isLoading: adrsLoading,
    error: adrsError,
  } = api.adr.list.useQuery(
    {
      workspaceId: workspaceId ?? "",
      repositoryIds: repoFilter.length > 0 ? repoFilter : undefined,
      statuses:
        statusFilter.length > 0 ? (statusFilter as AdrStatusValue[]) : undefined,
      productId: productFilter ?? undefined,
      search: debouncedSearch.trim() || undefined,
    },
    { enabled: !!workspaceId },
  );

  const { data: configs } = api.adr.listConfigs.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const { data: products } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const repoOptions = useMemo(
    () =>
      (configs ?? []).map((c) => ({
        value: c.repositoryId,
        label: c.repository.fullName,
      })),
    [configs],
  );
  const productOptions = useMemo(
    () => [
      { value: "workspace", label: "Workspace-level (no product)" },
      ...(products ?? []).map((p) => ({ value: p.id, label: p.name })),
    ],
    [products],
  );

  const hasFilters =
    repoFilter.length > 0 ||
    statusFilter.length > 0 ||
    productFilter !== null ||
    debouncedSearch.trim().length > 0;

  if (isLoading) {
    return (
      <Container size="xl" className="py-8">
        <Skeleton height={40} width={240} mb="lg" />
        <Skeleton height={300} />
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

  return (
    <Container size="xl" className="py-8">
      <Group justify="space-between" mb="lg">
        <div>
          <Title order={2}>Decisions</Title>
          <Text size="sm" className="text-text-secondary">
            Architectural decision records across this workspace&apos;s enrolled
            repos. Read-only — git is the source of truth.
          </Text>
        </div>
      </Group>

      <Group mb="md" gap="sm" align="flex-end" wrap="wrap">
        <TextInput
          size="sm"
          w={240}
          leftSection={<IconSearch size={14} />}
          placeholder="Search title and body…"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          aria-label="Search decisions"
        />
        <MultiSelect
          size="sm"
          w={240}
          data={repoOptions}
          value={repoFilter}
          onChange={setRepoFilter}
          placeholder="All repositories"
          clearable
          searchable
          aria-label="Filter by repository"
        />
        <MultiSelect
          size="sm"
          w={200}
          data={[...STATUS_OPTIONS]}
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="All statuses"
          clearable
          aria-label="Filter by status"
        />
        <Select
          size="sm"
          w={220}
          data={productOptions}
          value={productFilter}
          onChange={setProductFilter}
          placeholder="All products"
          clearable
          aria-label="Filter by product"
        />
      </Group>

      {adrsLoading ? (
        <Skeleton height={300} />
      ) : adrsError ? (
        <Text className="text-text-secondary">
          {adrsError.data?.code === "FORBIDDEN"
            ? "You don't have access to this workspace's decisions — they are visible to workspace members only."
            : `Couldn't load decisions: ${adrsError.message}`}
        </Text>
      ) : !adrs || adrs.length === 0 ? (
        <Text className="text-text-secondary">
          {hasFilters ? (
            "No decisions match these filters."
          ) : (
            <>
              No decisions synced yet. Enrol repositories under{" "}
              <Link
                href={`/w/${workspace.slug}/settings/decisions`}
                className="text-brand-primary hover:underline"
              >
                Settings → Decisions
              </Link>
              , then run a sync.
            </>
          )}
        </Text>
      ) : (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Label</Table.Th>
              <Table.Th>Title</Table.Th>
              <Table.Th>Repository</Table.Th>
              <Table.Th>Product</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Decided</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {adrs.map((adr) => (
              <Table.Tr key={adr.id}>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Text size="sm" fw={600} className="whitespace-nowrap">
                      {adr.label ?? "—"}
                    </Text>
                    {adr.isDuplicateLabel ? (
                      <Tooltip label="Duplicate label — another decision shares this number. Consider renumbering in the repo.">
                        <IconAlertTriangle
                          size={14}
                          className="text-brand-warning"
                          aria-label="Duplicate label"
                        />
                      </Tooltip>
                    ) : null}
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Text size="sm">{adr.title}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="outline" color="gray">
                    {adr.repository.fullName}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" className="text-text-secondary">
                    {adr.repository.product?.name ?? "Workspace"}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <StatusChip status={adr.status} statusRaw={adr.statusRaw} />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" className="text-text-secondary whitespace-nowrap">
                    {adr.decidedAt
                      ? new Date(adr.decidedAt).toLocaleDateString()
                      : "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Container>
  );
}
