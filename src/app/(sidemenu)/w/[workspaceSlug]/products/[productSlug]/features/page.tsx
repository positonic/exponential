"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Popover,
  SegmentedControl,
  Select,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconAdjustments,
  IconBulb,
  IconFilter,
  IconLayoutGrid,
  IconList,
  IconPlus,
} from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  IDEA: "Idea",
  DEFINED: "Defined",
  IN_PROGRESS: "In progress",
  SHIPPED: "Shipped",
  ARCHIVED: "Archived",
};

const STATUS_ORDER: Record<string, number> = {
  IDEA: 0, DEFINED: 1, IN_PROGRESS: 2, SHIPPED: 3, ARCHIVED: 4,
};

const STATUS_COLORS: Record<string, string> = {
  IDEA: "gray",
  DEFINED: "blue",
  IN_PROGRESS: "yellow",
  SHIPPED: "green",
  ARCHIVED: "dark",
};

const PRIORITY_LABELS: Record<number, string> = {
  0: "Urgent", 1: "High", 2: "Medium", 3: "Low", 4: "None",
};

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

type SortField = "status" | "name" | "priority" | "scopes" | "tickets";
type SortDir = "asc" | "desc";

function cmp(a: string | number, b: string | number, dir: SortDir) {
  if (a < b) return dir === "asc" ? -1 : 1;
  if (a > b) return dir === "asc" ? 1 : -1;
  return 0;
}

function sortValue(f: Record<string, unknown>, field: SortField): string | number {
  switch (field) {
    case "status": return STATUS_ORDER[(f.status as string) ?? ""] ?? 99;
    case "name": return ((f.name as string) ?? "").toLowerCase();
    case "priority": return (f.priority as number) ?? 99;
    case "scopes": return (f._count as { scopes?: number })?.scopes ?? 0;
    case "tickets": return (f._count as { tickets?: number })?.tickets ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Group by
// ---------------------------------------------------------------------------

type GroupByField = "none" | "status" | "priority" | "area";

const GROUP_BY_OPTIONS = [
  { value: "none", label: "No grouping" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "area", label: "Area" },
];

function groupKey(f: Record<string, unknown>, field: GroupByField): string {
  switch (field) {
    case "status": return (f.status as string) ?? "UNKNOWN";
    case "priority": return f.priority != null ? String(f.priority as number) : "unset";
    case "area": {
      const tags = f.tags as Array<{ tag: { category: string | null; name: string } }> | undefined;
      const areaTag = tags?.find((t) => t.tag.category === "area");
      return areaTag?.tag.name ?? "No area";
    }
    default: return "all";
  }
}

function groupLabel(key: string, field: GroupByField): string {
  if (field === "status") return STATUS_LABELS[key] ?? key;
  if (field === "priority") {
    if (key === "unset") return "No priority";
    return PRIORITY_LABELS[Number(key)] ?? key;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FeaturesListPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [search, setSearch] = useState("");
  const [sortField] = useState<SortField>("status");
  const [sortDir] = useState<SortDir>("asc");
  const [view, setView] = useState("list");
  const [groupBy, setGroupBy] = useState<GroupByField>("none");

  const { data: product } = api.product.product.getBySlug.useQuery(
    { workspaceId: workspaceId ?? "", slug: productSlug },
    { enabled: !!workspaceId && !!productSlug },
  );

  const { data: features, isLoading } = api.product.feature.list.useQuery(
    { productId: product?.id ?? "" },
    { enabled: !!product?.id },
  );

  // Filter + sort
  const sorted = useMemo(() => {
    if (!features) return [];
    const q = search.toLowerCase().trim();
    const list = q
      ? features.filter(
          (f) =>
            f.name.toLowerCase().includes(q) ||
            f.status.toLowerCase().includes(q) ||
            (f.description ?? "").toLowerCase().includes(q),
        )
      : [...features];
    list.sort((a, b) =>
      cmp(
        sortValue(a as unknown as Record<string, unknown>, sortField),
        sortValue(b as unknown as Record<string, unknown>, sortField),
        sortDir,
      ),
    );
    return list;
  }, [features, search, sortField, sortDir]);

  // Group
  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", items: sorted }];
    const map = new Map<string, typeof sorted>();
    for (const f of sorted) {
      const k = groupKey(f as unknown as Record<string, unknown>, groupBy);
      const arr = map.get(k);
      if (arr) arr.push(f);
      else map.set(k, [f]);
    }
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      label: groupLabel(key, groupBy),
      items,
    }));
  }, [sorted, groupBy]);

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/features`;

  // List item renderer
  const renderListItem = (feature: (typeof sorted)[number]) => (
    <Link
      key={feature.id}
      href={`${basePath}/${feature.id}`}
      className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors border-b border-border-primary"
    >
      <Badge size="xs" variant="light" color={STATUS_COLORS[feature.status] ?? "gray"} className="shrink-0">
        {STATUS_LABELS[feature.status] ?? feature.status}
      </Badge>
      <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
        {feature.name}
      </Text>
      {feature.priority != null && (
        <Text size="xs" className="text-text-muted shrink-0">
          {PRIORITY_LABELS[feature.priority]}
        </Text>
      )}
      <Text size="xs" className="text-text-muted shrink-0">
        {feature._count.scopes} scopes
      </Text>
      <Text size="xs" className="text-text-muted shrink-0">
        {feature._count.tickets} tickets
      </Text>
    </Link>
  );

  // Card renderer
  const renderCard = (feature: (typeof sorted)[number]) => (
    <Card
      key={feature.id}
      component={Link}
      href={`${basePath}/${feature.id}`}
      className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors"
      padding="lg"
    >
      <Group gap="xs" mb={8}>
        <Badge
          color={STATUS_COLORS[feature.status] ?? "gray"}
          variant="light"
          size="xs"
        >
          {STATUS_LABELS[feature.status] ?? feature.status}
        </Badge>
        {feature.priority != null && (
          <Badge variant="outline" size="xs" color="gray">
            {PRIORITY_LABELS[feature.priority]}
          </Badge>
        )}
      </Group>

      <Text fw={600} size="sm" className="text-text-primary" lineClamp={1}>
        {feature.name}
      </Text>

      {feature.description && (
        <Text size="xs" className="text-text-muted mt-1" lineClamp={2}>
          {feature.description}
        </Text>
      )}

      {feature.goal && (
        <Text size="xs" className="text-text-muted mt-2">
          &rarr; {feature.goal.title}
        </Text>
      )}

      <Group gap="md" mt="md">
        <Text size="xs" className="text-text-muted">
          {feature._count.scopes} scopes
        </Text>
        <Text size="xs" className="text-text-muted">
          {feature._count.tickets} tickets
        </Text>
      </Group>
    </Card>
  );

  return (
    <Stack gap="sm">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <SegmentedControl
          value={view}
          onChange={setView}
          size="xs"
          data={[
            { value: "list", label: (<Tooltip label="List" position="bottom"><div className="flex items-center justify-center px-1"><IconList size={15} /></div></Tooltip>) },
            { value: "cards", label: (<Tooltip label="Cards" position="bottom"><div className="flex items-center justify-center px-1"><IconLayoutGrid size={15} /></div></Tooltip>) },
          ]}
          styles={{ root: { backgroundColor: "var(--color-surface-secondary)", border: "1px solid var(--color-border-primary)" } }}
        />

        <div className="flex-1" />

        <TextInput
          placeholder="Search..."
          size="xs"
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          styles={{
            root: { width: 200 },
            input: { backgroundColor: "transparent", border: "1px solid var(--color-border-primary)", fontSize: "0.8rem", height: 30, minHeight: 30 },
          }}
        />

        <div className="flex items-center border border-border-primary rounded-md overflow-hidden">
          <Tooltip label="Filter" position="bottom">
            <ActionIcon variant="subtle" size="sm" className="text-text-muted hover:text-text-primary rounded-none" style={{ height: 30, width: 30 }}>
              <IconFilter size={15} />
            </ActionIcon>
          </Tooltip>
          <div className="w-px h-4 bg-border-primary" />
          <Popover position="bottom-end" withinPortal shadow="md">
            <Popover.Target>
              <Tooltip label="Display settings" position="bottom">
                <ActionIcon variant="subtle" size="sm" className="text-text-muted hover:text-text-primary rounded-none" style={{ height: 30, width: 30 }}>
                  <IconAdjustments size={15} />
                </ActionIcon>
              </Tooltip>
            </Popover.Target>
            <Popover.Dropdown
              styles={{
                dropdown: {
                  backgroundColor: "var(--color-bg-elevated)",
                  border: "1px solid var(--color-border-primary)",
                  minWidth: 260,
                },
              }}
            >
              <div className="flex items-center justify-between gap-4 py-1">
                <Text size="xs" className="text-text-muted whitespace-nowrap">Group by</Text>
                <Select
                  value={groupBy}
                  onChange={(v) => v && setGroupBy(v as GroupByField)}
                  data={GROUP_BY_OPTIONS}
                  size="xs"
                  variant="filled"
                  comboboxProps={{ withinPortal: true }}
                  styles={{
                    root: { flex: 1 },
                    input: { fontSize: "0.8rem", height: 28, minHeight: 28 },
                  }}
                />
              </div>
            </Popover.Dropdown>
          </Popover>
        </div>

        <Button
          component={Link}
          href={`${basePath}/new`}
          size="xs"
          leftSection={<IconPlus size={14} />}
          disabled={!product}
          variant="light"
          styles={{ root: { height: 30, paddingLeft: 10, paddingRight: 12, fontSize: "0.8rem" } }}
        >
          New feature
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <Stack gap="xs">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} height={view === "cards" ? 80 : 36} />)}
        </Stack>
      ) : sorted.length > 0 ? (
        view === "list" ? (
          /* List view */
          <div className="border border-border-primary rounded-lg overflow-hidden">
            {groups.map((group) => (
              groupBy === "none" ? (
                <div key={group.key}>{group.items.map(renderListItem)}</div>
              ) : (
                <div key={group.key}>
                  <div className="bg-surface-secondary/50 px-3 py-2 border-b border-border-primary">
                    <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wide">
                      {group.label}
                      <Badge size="xs" variant="light" ml="xs">{group.items.length}</Badge>
                    </Text>
                  </div>
                  {group.items.map(renderListItem)}
                </div>
              )
            ))}
          </div>
        ) : (
          /* Cards view */
          <div>
            {groups.map((group) => (
              groupBy === "none" ? (
                <SimpleGrid key={group.key} cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                  {group.items.map(renderCard)}
                </SimpleGrid>
              ) : (
                <div key={group.key} className="mb-6">
                  <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
                    {group.label}
                    <Badge size="xs" variant="light" ml="xs">{group.items.length}</Badge>
                  </Text>
                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {group.items.map(renderCard)}
                  </SimpleGrid>
                </div>
              )
            ))}
          </div>
        )
      ) : features && features.length > 0 ? (
        <Text size="sm" className="text-text-muted py-8 text-center">
          No features match your search.
        </Text>
      ) : (
        <EmptyState
          icon={IconBulb}
          message="No features yet. Create one to start tracking what you're building."
          action={
            product && (
              <Button
                component={Link}
                href={`${basePath}/new`}
                leftSection={<IconPlus size={16} />}
                color="brand"
              >
                New feature
              </Button>
            )
          }
        />
      )}
    </Stack>
  );
}
