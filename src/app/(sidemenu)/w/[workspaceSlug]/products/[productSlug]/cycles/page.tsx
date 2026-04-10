"use client";

import Link from "next/link";
import { useState } from "react";
import { useParams } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Skeleton,
  Stack,
  Switch,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconCalendarClock,
  IconDots,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "gray",
  ACTIVE: "green",
  COMPLETED: "blue",
  ARCHIVED: "dark",
};

const STATUS_LABELS: Record<string, string> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
};

export default function CyclesListPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const [autoCreatePaused, setAutoCreatePaused] = useState(false);

  const { data: cycles, isLoading } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "", autoCreate: !autoCreatePaused },
    { enabled: !!workspaceId },
  );

  const utils = api.useUtils();

  const deleteCycle = api.product.cycle.delete.useMutation({
    onSuccess: () => {
      void utils.product.cycle.list.invalidate({ workspaceId: workspaceId ?? "" });
    },
  });

  const updateCycle = api.product.cycle.update.useMutation({
    onSuccess: () => {
      void utils.product.cycle.list.invalidate({ workspaceId: workspaceId ?? "" });
    },
  });

  const handleDelete = (id: string, name: string) => {
    modals.openConfirmModal({
      title: "Delete cycle",
      children: (
        <Text size="sm">
          Permanently delete {name}? Tickets assigned to this cycle will be unlinked.
        </Text>
      ),
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteCycle.mutate({ id }),
    });
  };

  const handleCancel = (id: string, name: string) => {
    modals.openConfirmModal({
      title: "Cancel cycle",
      children: (
        <Text size="sm">
          Cancel {name}? Incomplete tickets will remain but won't be grouped under this cycle.
        </Text>
      ),
      labels: { confirm: "Cancel cycle", cancel: "Keep" },
      confirmProps: { color: "red" },
      onConfirm: () => updateCycle.mutate({ id, status: "ARCHIVED" }),
    });
  };

  const handleComplete = (id: string) => {
    updateCycle.mutate({ id, status: "COMPLETED" });
  };

  const handleStart = (id: string) => {
    updateCycle.mutate({ id, status: "ACTIVE" });
  };

  const handleExtend = (id: string, endDate: Date | null) => {
    if (!endDate) return;
    const newEnd = new Date(endDate);
    newEnd.setDate(newEnd.getDate() + 7);
    updateCycle.mutate({ id, endDate: newEnd });
  };

  const handleShortenToToday = (id: string) => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    updateCycle.mutate({ id, endDate: today, status: "COMPLETED" });
  };

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/cycles`;

  // Group cycles by status
  const active = cycles?.filter((c) => c.status === "ACTIVE") ?? [];
  const upcoming = cycles?.filter((c) => c.status === "PLANNED") ?? [];
  const completed = cycles?.filter((c) => c.status === "COMPLETED") ?? [];
  const cancelled = cycles?.filter((c) => c.status === "ARCHIVED") ?? [];

  // Sort: active/upcoming by startDate asc, completed/cancelled by endDate desc
  active.sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));
  upcoming.sort((a, b) => (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0));
  completed.sort((a, b) => (b.endDate?.getTime() ?? 0) - (a.endDate?.getTime() ?? 0));
  cancelled.sort((a, b) => (b.endDate?.getTime() ?? 0) - (a.endDate?.getTime() ?? 0));

  return (
    <Stack gap="lg">
      {/* Action bar */}
      <Group justify="space-between">
        <Group gap="xs">
          <Tooltip
            label={autoCreatePaused ? "Auto-creation paused. Click to resume." : "Auto-creation active. Click to pause."}
            position="bottom"
          >
            <div className="flex items-center gap-2 rounded-lg border border-border-primary px-3 py-1.5">
              {autoCreatePaused ? (
                <IconPlayerPause size={14} className="text-yellow-500" />
              ) : (
                <IconPlayerPlay size={14} className="text-green-500" />
              )}
              <Text size="xs" className="text-text-secondary">
                Auto-create
              </Text>
              <Switch
                checked={!autoCreatePaused}
                onChange={(e) => setAutoCreatePaused(!e.currentTarget.checked)}
                size="xs"
              />
            </div>
          </Tooltip>
        </Group>

        <Button
          component={Link}
          href={`${basePath}/new`}
          leftSection={<IconPlus size={14} />}
          size="xs"
          variant="light"
        >
          New cycle
        </Button>
      </Group>

      {autoCreatePaused && (
        <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 px-4 py-3">
          <Text size="xs" className="text-yellow-400">
            Auto-creation is paused. No new cycles will be generated
            automatically. You can still create cycles manually. Toggle
            auto-create back on when ready.
          </Text>
        </div>
      )}

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2].map((i) => (
            <Skeleton key={i} height={80} />
          ))}
        </Stack>
      ) : cycles && cycles.length > 0 ? (
        <Stack gap="md">
          {active.length > 0 && (
            <CycleSection label="Active" cycles={active} basePath={basePath} actions={{ onDelete: handleDelete, onCancel: handleCancel, onComplete: handleComplete, onStart: handleStart, onExtend: handleExtend, onShortenToToday: handleShortenToToday }} />
          )}
          {upcoming.length > 0 && (
            <CycleSection label="Upcoming" cycles={upcoming} basePath={basePath} actions={{ onDelete: handleDelete, onCancel: handleCancel, onComplete: handleComplete, onStart: handleStart, onExtend: handleExtend, onShortenToToday: handleShortenToToday }} />
          )}
          {completed.length > 0 && (
            <CycleSection label="Completed" cycles={completed} basePath={basePath} actions={{ onDelete: handleDelete, onCancel: handleCancel, onComplete: handleComplete, onStart: handleStart, onExtend: handleExtend, onShortenToToday: handleShortenToToday }} />
          )}
          {cancelled.length > 0 && (
            <CycleSection label="Cancelled" cycles={cancelled} basePath={basePath} actions={{ onDelete: handleDelete, onCancel: handleCancel, onComplete: handleComplete, onStart: handleStart, onExtend: handleExtend, onShortenToToday: handleShortenToToday }} />
          )}
        </Stack>
      ) : (
        <EmptyState
          icon={IconCalendarClock}
          message="No cycles yet. Enable auto-create in settings or create one manually."
          action={
            <Button
              component={Link}
              href={`${basePath}/new`}
              leftSection={<IconPlus size={16} />}
              color="brand"
            >
              New cycle
            </Button>
          }
        />
      )}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Cycle card with overflow menu
// ---------------------------------------------------------------------------

type CycleItem = {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  cycleGoal: string | null;
  _count: { tickets: number };
};

interface CycleActions {
  onDelete: (id: string, name: string) => void;
  onCancel: (id: string, name: string) => void;
  onComplete: (id: string) => void;
  onStart: (id: string) => void;
  onExtend: (id: string, endDate: Date | null) => void;
  onShortenToToday: (id: string) => void;
}

function CycleSection({
  label,
  cycles,
  basePath,
  actions,
}: {
  label: string;
  cycles: CycleItem[];
  basePath: string;
  actions: CycleActions;
}) {
  return (
    <div>
      <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
        {label}
      </Text>
      <Stack gap="sm">
        {cycles.map((cycle) => (
          <CycleCard key={cycle.id} cycle={cycle} basePath={basePath} actions={actions} />
        ))}
      </Stack>
    </div>
  );
}

function CycleCard({
  cycle,
  basePath,
  actions,
}: {
  cycle: CycleItem;
  basePath: string;
  actions: CycleActions;
}) {
  return (
    <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors">
      <Group justify="space-between" align="flex-start">
        <Link href={`${basePath}/${cycle.id}`} className="flex-1 min-w-0">
          <Group gap="sm">
            <Title order={5} className="text-text-primary">
              {cycle.name}
            </Title>
            <Badge
              color={STATUS_COLORS[cycle.status] ?? "gray"}
              variant="light"
              size="sm"
            >
              {STATUS_LABELS[cycle.status] ?? cycle.status}
            </Badge>
          </Group>
          {(cycle.startDate ?? cycle.endDate) && (
            <Text size="xs" className="text-text-muted mt-1">
              {cycle.startDate
                ? new Date(cycle.startDate).toLocaleDateString()
                : "?"}
              {" - "}
              {cycle.endDate
                ? new Date(cycle.endDate).toLocaleDateString()
                : "?"}
            </Text>
          )}
          {cycle.cycleGoal && (
            <Text size="sm" className="text-text-muted mt-1" lineClamp={1}>
              {cycle.cycleGoal}
            </Text>
          )}
        </Link>

        <Group gap="xs" align="center">
          <Text size="xs" className="text-text-muted">
            {cycle._count.tickets} tickets
          </Text>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" size="sm" className="text-text-muted">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {cycle.status === "PLANNED" && (
                <Menu.Item onClick={() => actions.onStart(cycle.id)}>
                  Start cycle
                </Menu.Item>
              )}
              {cycle.status === "ACTIVE" && (
                <>
                  <Menu.Item onClick={() => actions.onExtend(cycle.id, cycle.endDate)}>
                    Extend by 1 week
                  </Menu.Item>
                  <Menu.Item onClick={() => actions.onShortenToToday(cycle.id)}>
                    Shorten to today
                  </Menu.Item>
                  <Menu.Item onClick={() => actions.onComplete(cycle.id)}>
                    Complete cycle
                  </Menu.Item>
                </>
              )}
              {cycle.status === "ACTIVE" && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    onClick={() => actions.onCancel(cycle.id, cycle.name)}
                  >
                    Cancel cycle
                  </Menu.Item>
                </>
              )}
              {cycle.status === "PLANNED" && (
                <>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => actions.onDelete(cycle.id, cycle.name)}
                  >
                    Delete cycle
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Card>
  );
}
