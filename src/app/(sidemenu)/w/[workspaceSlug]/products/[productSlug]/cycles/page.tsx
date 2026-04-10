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

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/cycles`;

  // Separate active/upcoming from past
  const activeCycles = cycles?.filter(
    (c) => c.status === "ACTIVE" || c.status === "PLANNED",
  ) ?? [];
  const pastCycles = cycles?.filter(
    (c) => c.status === "COMPLETED" || c.status === "ARCHIVED",
  ) ?? [];

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
          {/* Active & upcoming */}
          {activeCycles.length > 0 && (
            <div>
              <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
                Current & upcoming
              </Text>
              <Stack gap="sm">
                {activeCycles.map((cycle) => (
                  <CycleCard key={cycle.id} cycle={cycle} basePath={basePath} />
                ))}
              </Stack>
            </div>
          )}

          {/* Past */}
          {pastCycles.length > 0 && (
            <div>
              <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider mb-2">
                Past
              </Text>
              <Stack gap="sm">
                {pastCycles.map((cycle) => (
                  <CycleCard key={cycle.id} cycle={cycle} basePath={basePath} />
                ))}
              </Stack>
            </div>
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

function CycleCard({
  cycle,
  basePath,
}: {
  cycle: {
    id: string;
    name: string;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    cycleGoal: string | null;
    _count: { tickets: number };
  };
  basePath: string;
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
                <Menu.Item>Start cycle</Menu.Item>
              )}
              {cycle.status === "ACTIVE" && (
                <>
                  <Menu.Item>Extend by 1 week</Menu.Item>
                  <Menu.Item>Shorten to today</Menu.Item>
                  <Menu.Item>Complete cycle</Menu.Item>
                </>
              )}
              {(cycle.status === "PLANNED" || cycle.status === "ACTIVE") && (
                <Menu.Item>Edit dates</Menu.Item>
              )}
              {cycle.status === "ACTIVE" && (
                <>
                  <Menu.Divider />
                  <Menu.Item color="red">
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
