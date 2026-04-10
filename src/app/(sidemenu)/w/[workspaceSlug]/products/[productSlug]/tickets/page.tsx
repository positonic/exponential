"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ActionIcon,
  Avatar,
  Badge,
  Button,
  SegmentedControl,
  Skeleton,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconAdjustments,
  IconFilter,
  IconLayoutColumns,
  IconLayoutList,
  IconList,
  IconPlus,
  IconSelector,
  IconSortAscending,
  IconSortDescending,
  IconTicket,
} from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";
import { CreateTicketModal } from "~/app/_components/product/CreateTicketModal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const STATUS_ORDER: Record<string, number> = {
  BACKLOG: 0,
  TODO: 1,
  IN_PROGRESS: 2,
  IN_REVIEW: 3,
  DONE: 4,
  CANCELLED: 5,
};

const PRIORITY_LABELS: Record<number, string> = {
  0: "Urgent",
  1: "High",
  2: "Medium",
  3: "Low",
  4: "None",
};

const TYPE_COLORS: Record<string, string> = {
  BUG: "red",
  FEATURE: "blue",
  CHORE: "gray",
  IMPROVEMENT: "teal",
  SPIKE: "violet",
  RESEARCH: "yellow",
};

// ---------------------------------------------------------------------------
// Sort helpers
// ---------------------------------------------------------------------------

type SortField = "status" | "title" | "priority" | "assignee" | "type" | "epic" | "cycle";
type SortDir = "asc" | "desc";

function compareField(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  field: SortField,
  dir: SortDir,
): number {
  let av: string | number;
  let bv: string | number;

  switch (field) {
    case "status":
      av = STATUS_ORDER[(a.status as string) ?? ""] ?? 99;
      bv = STATUS_ORDER[(b.status as string) ?? ""] ?? 99;
      break;
    case "title":
      av = ((a.title as string) ?? "").toLowerCase();
      bv = ((b.title as string) ?? "").toLowerCase();
      break;
    case "priority":
      av = (a.priority as number) ?? 99;
      bv = (b.priority as number) ?? 99;
      break;
    case "assignee":
      av = ((a.assignee as { name?: string } | null)?.name ?? "zzz").toLowerCase();
      bv = ((b.assignee as { name?: string } | null)?.name ?? "zzz").toLowerCase();
      break;
    case "type":
      av = (a.type as string) ?? "";
      bv = (b.type as string) ?? "";
      break;
    case "epic":
      av = ((a.epic as { name?: string } | null)?.name ?? "zzz").toLowerCase();
      bv = ((b.epic as { name?: string } | null)?.name ?? "zzz").toLowerCase();
      break;
    case "cycle":
      av = ((a.cycle as { name?: string } | null)?.name ?? "zzz").toLowerCase();
      bv = ((b.cycle as { name?: string } | null)?.name ?? "zzz").toLowerCase();
      break;
    default:
      return 0;
  }

  if (av < bv) return dir === "asc" ? -1 : 1;
  if (av > bv) return dir === "asc" ? 1 : -1;
  return 0;
}

// ---------------------------------------------------------------------------
// Sortable header
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  field,
  sortField,
  sortDir,
  onSort,
}: {
  label: string;
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = sortField === field;
  return (
    <Table.Th
      onClick={() => onSort(field)}
      className="cursor-pointer select-none hover:bg-surface-hover transition-colors"
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        {active ? (
          sortDir === "asc" ? (
            <IconSortAscending size={14} className="text-text-muted" />
          ) : (
            <IconSortDescending size={14} className="text-text-muted" />
          )
        ) : (
          <IconSelector size={14} className="text-text-muted opacity-0 group-hover:opacity-100" />
        )}
      </div>
    </Table.Th>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TicketsBacklogPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [modalOpened, setModalOpened] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("status");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [view, setView] = useState("table");

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: tickets, isLoading } = api.product.ticket.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: features } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const { data: epics } = api.epic.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const filtered = useMemo(() => {
    if (!tickets) return [];
    const q = search.toLowerCase().trim();
    let list = q
      ? tickets.filter(
          (t) =>
            t.title.toLowerCase().includes(q) ||
            t.type.toLowerCase().includes(q) ||
            (t.assignee?.name ?? "").toLowerCase().includes(q),
        )
      : [...tickets];

    list.sort((a, b) => compareField(a as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>, sortField, sortDir));
    return list;
  }, [tickets, search, sortField, sortDir]);

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/tickets`;

  return (
    <Stack gap="sm">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <SegmentedControl
          value={view}
          onChange={setView}
          size="xs"
          data={[
            {
              value: "table",
              label: (
                <Tooltip label="Table" position="bottom">
                  <div className="flex items-center justify-center px-1">
                    <IconLayoutList size={15} />
                  </div>
                </Tooltip>
              ),
            },
            {
              value: "board",
              label: (
                <Tooltip label="Board" position="bottom">
                  <div className="flex items-center justify-center px-1">
                    <IconLayoutColumns size={15} />
                  </div>
                </Tooltip>
              ),
            },
            {
              value: "list",
              label: (
                <Tooltip label="List" position="bottom">
                  <div className="flex items-center justify-center px-1">
                    <IconList size={15} />
                  </div>
                </Tooltip>
              ),
            },
          ]}
          styles={{
            root: { backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border-primary)" },
          }}
        />

        <div className="flex-1" />

        <TextInput
          placeholder="Search..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{
            root: { width: 200 },
            input: {
              backgroundColor: "transparent",
              border: "1px solid var(--color-border-primary)",
              fontSize: "0.8rem",
              height: 30,
              minHeight: 30,
            },
          }}
        />
        <div className="flex items-center border border-border-primary rounded-md overflow-hidden">
          <Tooltip label="Filter" position="bottom">
            <ActionIcon
              variant="subtle"
              size="sm"
              className="text-text-muted hover:text-text-primary rounded-none"
              style={{ height: 30, width: 30 }}
            >
              <IconFilter size={15} />
            </ActionIcon>
          </Tooltip>
          <div className="w-px h-4 bg-border-primary" />
          <Tooltip label="Display settings" position="bottom">
            <ActionIcon
              variant="subtle"
              size="sm"
              className="text-text-muted hover:text-text-primary rounded-none"
              style={{ height: 30, width: 30 }}
            >
              <IconAdjustments size={15} />
            </ActionIcon>
          </Tooltip>
        </div>
        <Button
          size="xs"
          leftSection={<IconPlus size={14} />}
          onClick={() => setModalOpened(true)}
          disabled={!product}
          variant="light"
          styles={{
            root: { height: 30, paddingLeft: 10, paddingRight: 12, fontSize: "0.8rem" },
          }}
        >
          New ticket
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={36} />
          ))}
        </Stack>
      ) : filtered.length > 0 ? (
        <div className="border border-border-primary rounded-lg overflow-hidden">
          <Table
            highlightOnHover
            verticalSpacing={6}
            horizontalSpacing="md"
            styles={{
              table: { fontSize: "0.8rem" },
              th: {
                fontSize: "0.7rem",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                color: "var(--color-text-muted)",
                borderBottom: "1px solid var(--color-border-primary)",
              },
              td: {
                borderBottom: "1px solid var(--color-border-primary)",
              },
              tr: {
                backgroundColor: "transparent",
              },
            }}
          >
            <Table.Thead>
              <Table.Tr>
                <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Title" field="title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="DRI" field="assignee" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Label" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Epic" field="epic" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                <SortHeader label="Cycle" field="cycle" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((ticket) => (
                <Table.Tr
                  key={ticket.id}
                  className="cursor-pointer hover:bg-surface-hover transition-colors"
                  onClick={() => {
                    window.location.href = `${basePath}/${ticket.id}`;
                  }}
                >
                  <Table.Td style={{ width: 100 }}>
                    <Badge
                      size="xs"
                      variant="light"
                      color={
                        ticket.status === "DONE"
                          ? "green"
                          : ticket.status === "IN_PROGRESS"
                            ? "yellow"
                            : ticket.status === "IN_REVIEW"
                              ? "blue"
                              : "gray"
                      }
                    >
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" className="text-text-primary" lineClamp={1}>
                      {ticket.title}
                    </Text>
                  </Table.Td>
                  <Table.Td style={{ width: 80 }}>
                    {ticket.priority != null ? (
                      <Text size="xs" className="text-text-secondary">
                        {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                      </Text>
                    ) : (
                      <Text size="xs" className="text-text-muted">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ width: 120 }}>
                    {ticket.assignee ? (
                      <div className="flex items-center gap-1.5">
                        <Avatar size="xs" radius="xl" src={ticket.assignee.image}>
                          {(ticket.assignee.name ?? "?")[0]?.toUpperCase()}
                        </Avatar>
                        <Text size="xs" className="text-text-secondary" lineClamp={1}>
                          {ticket.assignee.name}
                        </Text>
                      </div>
                    ) : (
                      <Text size="xs" className="text-text-muted">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ width: 100 }}>
                    <Badge
                      size="xs"
                      variant="light"
                      color={TYPE_COLORS[ticket.type] ?? "gray"}
                    >
                      {ticket.type.toLowerCase()}
                    </Badge>
                  </Table.Td>
                  <Table.Td style={{ width: 120 }}>
                    {ticket.epic ? (
                      <Text size="xs" className="text-text-secondary" lineClamp={1}>
                        {ticket.epic.name}
                      </Text>
                    ) : (
                      <Text size="xs" className="text-text-muted">-</Text>
                    )}
                  </Table.Td>
                  <Table.Td style={{ width: 120 }}>
                    {ticket.cycle ? (
                      <Text size="xs" className="text-text-secondary" lineClamp={1}>
                        {ticket.cycle.name}
                      </Text>
                    ) : (
                      <Text size="xs" className="text-text-muted">-</Text>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </div>
      ) : tickets && tickets.length > 0 ? (
        <Text size="sm" className="text-text-muted py-8 text-center">
          No tickets match your search.
        </Text>
      ) : (
        <EmptyState
          icon={IconTicket}
          title="No tickets yet"
          message="Create your first ticket to start tracking work."
          action={
            <Button
              onClick={() => setModalOpened(true)}
              leftSection={<IconPlus size={16} />}
              color="brand"
              disabled={!product}
            >
              New ticket
            </Button>
          }
        />
      )}

      {product && (
        <CreateTicketModal
          opened={modalOpened}
          onClose={() => setModalOpened(false)}
          productId={product.id}
          productName={product.name}
          basePath={basePath}
          features={features}
          cycles={cycles}
          epics={epics}
        />
      )}
    </Stack>
  );
}
