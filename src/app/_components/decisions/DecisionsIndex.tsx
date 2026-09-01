"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Group,
  MultiSelect,
  Select,
  Skeleton,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { IconAlertTriangle, IconSearch } from "@tabler/icons-react";
import { useDebouncedValue } from "@mantine/hooks";
import Link from "next/link";
import { api } from "~/trpc/react";

/**
 * The Decision Log index table + filters, shared between the workspace page
 * (/w/[slug]/decisions) and the product Decisions lens
 * (/w/[slug]/products/[productSlug]/decisions). Read-only by design — git is
 * the source of truth and no write path to ADR content exists.
 *
 * With `defaultProductId` (the product lens) the product filter starts on that
 * product, and while a real product is selected the results ALSO include
 * workspace-level (null-product) ADRs, which render with a "workspace-wide"
 * marker — a workspace-global decision applies to every product until proven
 * otherwise. The filter stays fully editable, so the lens can be widened to
 * the whole workspace or pointed at another product.
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

interface DecisionsIndexProps {
  workspaceId: string;
  workspaceSlug: string;
  /**
   * Start the product filter on this product (the product Decisions lens).
   * While a real product is selected, workspace-wide ADRs are included too.
   */
  defaultProductId?: string;
}

export function DecisionsIndex({
  workspaceId,
  workspaceSlug,
  defaultProductId,
}: DecisionsIndexProps) {
  const [repoFilter, setRepoFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [productFilter, setProductFilter] = useState<string | null>(
    defaultProductId ?? null,
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 250);

  // Only the product lens folds workspace-wide ADRs into a product selection;
  // the workspace page keeps its product filter exact.
  const includeWorkspaceWide =
    !!defaultProductId && !!productFilter && productFilter !== "workspace";

  const {
    data: adrs,
    isLoading: adrsLoading,
    error: adrsError,
  } = api.adr.list.useQuery(
    {
      workspaceId,
      repositoryIds: repoFilter.length > 0 ? repoFilter : undefined,
      statuses:
        statusFilter.length > 0 ? (statusFilter as AdrStatusValue[]) : undefined,
      productId: productFilter ?? undefined,
      includeWorkspaceWide: includeWorkspaceWide || undefined,
      search: debouncedSearch.trim() || undefined,
    },
    { enabled: !!workspaceId },
  );

  const { data: configs } = api.adr.listConfigs.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );
  const { data: products } = api.product.product.list.useQuery(
    { workspaceId },
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

  // "Filtered" relative to the page's default view — the product lens's
  // starting product doesn't count, so its true-empty state still shows the
  // enrolment CTA rather than "no match".
  const hasFilters =
    repoFilter.length > 0 ||
    statusFilter.length > 0 ||
    productFilter !== (defaultProductId ?? null) ||
    debouncedSearch.trim().length > 0;

  return (
    <>
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
                href={`/w/${workspaceSlug}/settings/decisions`}
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
              <Table.Th>Links</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {adrs.map((adr) => (
              <Table.Tr key={adr.id}>
                <Table.Td>
                  <Group gap={4} wrap="nowrap">
                    <Text
                      component={Link}
                      href={`/w/${workspaceSlug}/decisions/${adr.id}`}
                      size="sm"
                      fw={600}
                      className="whitespace-nowrap text-brand-primary hover:underline"
                    >
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
                  <Text
                    component={Link}
                    href={`/w/${workspaceSlug}/decisions/${adr.id}`}
                    size="sm"
                    className="hover:underline"
                  >
                    {adr.title}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Badge variant="outline" color="gray">
                    {adr.repository.fullName}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  {adr.repository.productId === null ? (
                    <Badge variant="light" color="gray">
                      workspace-wide
                    </Badge>
                  ) : (
                    <Text size="sm" className="text-text-secondary">
                      {adr.repository.product?.name ?? "—"}
                    </Text>
                  )}
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
                <Table.Td>
                  <Text size="sm" className="text-text-secondary">
                    {adr._count.ticketLinks > 0 ? adr._count.ticketLinks : "—"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
