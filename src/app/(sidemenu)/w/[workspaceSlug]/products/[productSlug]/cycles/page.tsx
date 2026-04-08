"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconCalendarClock, IconPlus } from "@tabler/icons-react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { api } from "~/trpc/react";
import { EmptyState } from "~/app/_components/EmptyState";

const STATUS_COLORS: Record<string, string> = {
  PLANNED: "gray",
  ACTIVE: "green",
  COMPLETED: "blue",
  ARCHIVED: "dark",
};

export default function CyclesListPage() {
  const params = useParams();
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();

  const { data: cycles, isLoading } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  if (!workspace) return null;
  const basePath = `/w/${workspace.slug}/products/${productSlug}/cycles`;

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <div>
          <Title order={2} className="text-text-primary">
            Cycles
          </Title>
          <Text className="text-text-muted">
            Time-boxed iterations to group tickets, with goals and achievements.
            Cycles are workspace-scoped and shared across products.
          </Text>
        </div>
        <Button
          component={Link}
          href={`${basePath}/new`}
          leftSection={<IconPlus size={16} />}
          color="brand"
        >
          New cycle
        </Button>
      </Group>

      {isLoading ? (
        <Stack gap="sm">
          {[1, 2].map((i) => (
            <Skeleton key={i} height={80} />
          ))}
        </Stack>
      ) : cycles && cycles.length > 0 ? (
        <Stack gap="sm">
          {cycles.map((cycle) => (
            <Link key={cycle.id} href={`${basePath}/${cycle.id}`}>
              <Card className="border border-border-primary bg-surface-secondary hover:border-border-focus transition-colors">
                <Group justify="space-between">
                  <div>
                    <Group gap="sm">
                      <Title order={5} className="text-text-primary">
                        {cycle.name}
                      </Title>
                      <Badge
                        color={STATUS_COLORS[cycle.status] ?? "gray"}
                        variant="light"
                      >
                        {cycle.status.toLowerCase()}
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
                      <Text size="sm" className="text-text-muted mt-1">
                        {cycle.cycleGoal}
                      </Text>
                    )}
                  </div>
                  <div className="text-right">
                    <Text size="xs" className="text-text-muted">
                      {cycle._count.tickets} tickets
                    </Text>
                  </div>
                </Group>
              </Card>
            </Link>
          ))}
        </Stack>
      ) : (
        <EmptyState
          icon={IconCalendarClock}
          message="No cycles yet. Create one to group tickets into a time-boxed iteration."
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
