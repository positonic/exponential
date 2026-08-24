"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  Container,
  Title,
  Text,
  Table,
  Group,
  Badge,
  Skeleton,
  Stack,
  ActionIcon,
  VisuallyHidden,
  Avatar,
} from "@mantine/core";
import {
  IconPlus,
  IconTarget,
  IconCircleCheckFilled,
  IconAlertTriangleFilled,
  IconAlertCircleFilled,
  IconClockFilled,
  IconUsers,
  IconChartBar,
  IconChevronDown,
  IconChevronRight,
  IconCornerDownRight,
  IconFolder,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { slugify } from "~/utils/slugify";
import { GoalIcon } from "../GoalIcon";
import { CreateGoalModal } from "~/app/_components/CreateGoalModal";
import { useTerminology } from "~/hooks/useTerminology";
import { useRegisterPageContext } from "~/hooks/useRegisterPageContext";
import Link from "next/link";

type HealthStatus = "on-track" | "at-risk" | "off-track" | "no-update";

const healthConfig: Record<HealthStatus, { color: string; icon: typeof IconCircleCheckFilled; label: string }> = {
  "on-track": { color: "var(--mantine-color-green-6)", icon: IconCircleCheckFilled, label: "On track" },
  "at-risk": { color: "var(--mantine-color-yellow-6)", icon: IconAlertTriangleFilled, label: "At risk" },
  "off-track": { color: "var(--mantine-color-red-6)", icon: IconAlertCircleFilled, label: "Off track" },
  "no-update": { color: "var(--mantine-color-gray-6)", icon: IconClockFilled, label: "No update" },
};

function HealthCell({ health, updatedAt }: { health: string | null; updatedAt: Date | null }) {
  const config = healthConfig[(health as HealthStatus) ?? "no-update"] ?? healthConfig["no-update"];
  const Icon = config.icon;
  const timeAgo = updatedAt ? getTimeAgo(updatedAt) : null;

  return (
    <Group gap={6} wrap="nowrap">
      <Icon size={16} style={{ color: config.color }} />
      <Text size="sm" className="text-text-primary">
        {config.label}
      </Text>
      {timeAgo && (
        <Text size="xs" c="dimmed">
          {timeAgo}
        </Text>
      )}
    </Group>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d`;
  const diffWeeks = Math.floor(diffDays / 7);
  return `${diffWeeks}w`;
}

function formatTargetDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface GoalRow {
  id: number;
  title: string;
  description: string | null;
  status: string;
  health: string | null;
  healthUpdatedAt: Date | null;
  period: string | null;
  dueDate: Date | null;
  parentGoalId: number | null;
  driUserId: string | null;
  driUser?: { id: string; name: string | null; image: string | null } | null;
  icon: string | null;
  iconColor: string | null;
  projects: GoalProject[];
  parentGoal?: { id: number; title: string } | null;
  childGoals?: { id: number; title: string; status: string; health: string | null }[];
  _count?: { keyResults: number };
}

interface GoalProject {
  id: string;
  name: string;
  progress: number;
  status: string;
  endDate: Date | null;
}

/** A goal plus its place in the hierarchy of the rows currently on screen. */
interface GoalTreeNode {
  goal: GoalRow;
  depth: number;
  children: GoalTreeNode[];
}

/**
 * Nests goals under whichever parent is also in `goals`. A goal whose parent is
 * missing from the list (filtered out by status, or simply not on this project)
 * stays at the root so it never disappears — it gets a "sub-goal of X" label
 * instead. Unreachable nodes (a parent cycle) are promoted to roots too.
 */
function buildGoalTree(goals: GoalRow[]): GoalTreeNode[] {
  const nodes = new Map<number, GoalTreeNode>(
    goals.map((goal) => [goal.id, { goal, depth: 0, children: [] }]),
  );
  const roots: GoalTreeNode[] = [];

  for (const goal of goals) {
    const node = nodes.get(goal.id);
    if (!node) continue;
    const parent = goal.parentGoalId !== null ? nodes.get(goal.parentGoalId) : undefined;
    if (parent && parent !== node) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const seen = new Set<number>();
  const setDepth = (node: GoalTreeNode, depth: number) => {
    if (seen.has(node.goal.id)) return;
    seen.add(node.goal.id);
    node.depth = depth;
    node.children.forEach((child) => setDepth(child, depth + 1));
  };
  roots.forEach((root) => setDepth(root, 0));

  // Any node a cycle kept out of the walk still deserves a row.
  for (const node of nodes.values()) {
    if (!seen.has(node.goal.id)) {
      setDepth(node, 0);
      roots.push(node);
    }
  }

  return roots;
}

/** One rendered table row: a goal in the hierarchy, or a project nested under one. */
type VisibleRow =
  | { kind: "goal"; node: GoalTreeNode }
  | { kind: "project"; project: GoalProject; parentGoal: GoalRow; depth: number };

/**
 * Depth-first flatten, skipping the children of collapsed rows. `emitted`
 * guarantees one row per goal even if a parent cycle left a node reachable from
 * two places — a duplicate row would also collide on React's key. An expanded
 * goal's connected projects render directly beneath it, before any sub-goal
 * subtree, so they always read as belonging to that goal.
 */
function flattenGoalTree(
  nodes: GoalTreeNode[],
  collapsedIds: Set<number>,
  emitted = new Set<number>(),
): VisibleRow[] {
  return nodes.flatMap((node): VisibleRow[] => {
    if (emitted.has(node.goal.id)) return [];
    emitted.add(node.goal.id);
    if (collapsedIds.has(node.goal.id)) return [{ kind: "goal", node }];
    return [
      { kind: "goal", node },
      ...node.goal.projects.map((project): VisibleRow => ({
        kind: "project",
        project,
        parentGoal: node.goal,
        depth: node.depth + 1,
      })),
      ...flattenGoalTree(node.children, collapsedIds, emitted),
    ];
  });
}

function InitiativeRow({
  goal,
  workspaceSlug,
  depth,
  childCount,
  isExpanded,
  onToggle,
  goalLabel,
}: {
  goal: GoalRow;
  workspaceSlug: string;
  depth: number;
  childCount: number;
  isExpanded: boolean;
  onToggle: () => void;
  goalLabel: string;
}) {
  const projectCount = goal.projects.length;
  const activeProjectCount = goal.projects.filter(p => p.status === "ACTIVE").length;
  const krCount = goal._count?.keyResults ?? 0;
  const hasNestedRows = childCount > 0 || projectCount > 0;
  const isNested = depth > 0;
  const parentTitle = goal.parentGoal?.title ?? null;
  // Nesting is only visible when the parent is on screen above this row; if it
  // isn't, name the parent so the relationship still reads.
  const detachedParentTitle = !isNested ? parentTitle : null;
  const subGoalLabel = `Sub-${goalLabel.toLowerCase()}`;

  return (
    <Table.Tr
      className="cursor-pointer hover:bg-surface-hover transition-colors"
      data-goal-depth={depth}
    >
      {/* Name */}
      <Table.Td>
        <Group gap={4} wrap="nowrap" style={{ paddingLeft: depth * 28 }}>
          {hasNestedRows ? (
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              className="shrink-0"
              aria-label={isExpanded ? "Collapse nested rows" : "Expand nested rows"}
              aria-expanded={isExpanded}
              onClick={onToggle}
            >
              {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            </ActionIcon>
          ) : (
            <div className="w-[22px] shrink-0" aria-hidden="true" />
          )}
          {isNested && (
            <IconCornerDownRight
              size={14}
              className="text-text-muted shrink-0"
              aria-hidden="true"
            />
          )}
          {/* The indent and the ↳ carry the nesting visually; this spells the
              relationship out for assistive tech. It sits outside the Link so
              it stays separate content rather than joining the link's name. */}
          {isNested && parentTitle && (
            <VisuallyHidden>
              {subGoalLabel} of {parentTitle}
            </VisuallyHidden>
          )}
          <Link
            href={`/w/${workspaceSlug}/goals/${goal.id}`}
            className="no-underline min-w-0 flex-1"
          >
            <Group gap="sm" wrap="nowrap">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-secondary">
                <GoalIcon icon={goal.icon} iconColor={goal.iconColor} size={16} />
              </div>
              <div className="min-w-0">
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500} className="text-text-primary" truncate="end">
                    {goal.title}
                  </Text>
                  {childCount > 0 && !isExpanded && (
                    <Badge size="xs" variant="light" color="gray">
                      {childCount} {subGoalLabel.toLowerCase()}{childCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {projectCount > 0 && !isExpanded && (
                    <Badge size="xs" variant="light" color="gray">
                      {projectCount} project{projectCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                  {krCount > 0 && (
                    <Badge
                      size="xs"
                      variant="light"
                      color="brand"
                      leftSection={<IconChartBar size={10} />}
                    >
                      {krCount} KR{krCount === 1 ? "" : "s"}
                    </Badge>
                  )}
                </Group>
                {detachedParentTitle && (
                  <Group gap={4} wrap="nowrap">
                    <IconCornerDownRight size={12} className="text-text-muted shrink-0" aria-hidden="true" />
                    <Text size="xs" c="dimmed" lineClamp={1}>
                      {subGoalLabel} of {detachedParentTitle}
                    </Text>
                  </Group>
                )}
                {goal.description && (
                  <Text size="xs" c="dimmed" lineClamp={1}>
                    {goal.description}
                  </Text>
                )}
              </div>
            </Group>
          </Link>
        </Group>
      </Table.Td>

      {/* Owner (the goal's DRI) */}
      <Table.Td>
        {goal.driUser ? (
          <Group gap={6} wrap="nowrap">
            <Avatar
              src={goal.driUser.image}
              name={goal.driUser.name ?? undefined}
              size={20}
              radius="xl"
            />
            <Text size="sm" className="text-text-primary" truncate="end">
              {goal.driUser.name ?? "Unknown"}
            </Text>
          </Group>
        ) : (
          <Group gap={6} wrap="nowrap">
            <IconUsers size={14} className="text-text-muted" />
            <Text size="sm" c="dimmed">
              Unassigned
            </Text>
          </Group>
        )}
      </Table.Td>

      {/* Target */}
      <Table.Td>
        <Text size="sm" className="text-text-secondary">
          {goal.period ?? formatTargetDate(goal.dueDate)}
        </Text>
      </Table.Td>

      {/* Projects */}
      <Table.Td>
        {projectCount > 0 ? (
          <Group gap={4} wrap="nowrap">
            <IconCircleCheckFilled size={14} style={{ color: "var(--mantine-color-green-6)" }} />
            <Text size="sm" className="text-text-primary">
              {activeProjectCount} / {projectCount}
            </Text>
          </Group>
        ) : (
          <Text size="sm" c="dimmed">—</Text>
        )}
      </Table.Td>

      {/* Initiative Health */}
      <Table.Td>
        <HealthCell health={goal.health} updatedAt={goal.healthUpdatedAt} />
      </Table.Td>

      {/* Active Projects */}
      <Table.Td>
        <Text size="sm" c="dimmed">
          {activeProjectCount > 0 ? `${activeProjectCount} active` : "No updates"}
        </Text>
      </Table.Td>
    </Table.Tr>
  );
}

const projectStatusColor: Record<string, string> = {
  ACTIVE: "green",
  ON_HOLD: "yellow",
  COMPLETED: "blue",
  CANCELLED: "gray",
};

function formatProjectStatus(status: string): string {
  return status
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * A project connected to the goal directly above it — same nested treatment as
 * a sub-goal row (indent, ↳, hidden relationship text) so the hierarchy reads
 * as one system.
 */
function ProjectSubRow({
  project,
  parentGoalTitle,
  workspaceSlug,
  depth,
}: {
  project: GoalProject;
  parentGoalTitle: string;
  workspaceSlug: string;
  depth: number;
}) {
  const progress = Math.round(project.progress);

  return (
    <Table.Tr
      className="cursor-pointer hover:bg-surface-hover transition-colors"
      data-goal-depth={depth}
    >
      {/* Name */}
      <Table.Td>
        <Group gap={4} wrap="nowrap" style={{ paddingLeft: depth * 28 }}>
          <div className="w-[22px] shrink-0" aria-hidden="true" />
          <IconCornerDownRight
            size={14}
            className="text-text-muted shrink-0"
            aria-hidden="true"
          />
          <VisuallyHidden>Project of {parentGoalTitle}</VisuallyHidden>
          <Link
            href={`/w/${workspaceSlug}/projects/${slugify(project.name)}-${project.id}`}
            className="no-underline min-w-0 flex-1"
          >
            <Group gap="sm" wrap="nowrap">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-secondary">
                <IconFolder size={16} className="text-text-muted" />
              </div>
              <div className="min-w-0">
                <Group gap={6} wrap="nowrap">
                  <Text size="sm" fw={500} className="text-text-primary" truncate="end">
                    {project.name}
                  </Text>
                  <Badge
                    size="xs"
                    variant="light"
                    color={projectStatusColor[project.status] ?? "gray"}
                  >
                    {formatProjectStatus(project.status)}
                  </Badge>
                </Group>
                {progress > 0 && (
                  <Text size="xs" c="dimmed">
                    {progress}% complete
                  </Text>
                )}
              </div>
            </Group>
          </Link>
        </Group>
      </Table.Td>

      {/* Owner */}
      <Table.Td>
        <Text size="sm" c="dimmed">—</Text>
      </Table.Td>

      {/* Target */}
      <Table.Td>
        <Text size="sm" className="text-text-secondary">
          {formatTargetDate(project.endDate)}
        </Text>
      </Table.Td>

      {/* Projects */}
      <Table.Td>
        <Text size="sm" c="dimmed">—</Text>
      </Table.Td>

      {/* Initiative Health */}
      <Table.Td>
        <Text size="sm" c="dimmed">—</Text>
      </Table.Td>

      {/* Active Projects */}
      <Table.Td>
        <Text size="sm" c="dimmed">—</Text>
      </Table.Td>
    </Table.Tr>
  );
}

export function InitiativeDashboard({ projectId }: { projectId?: string } = {}) {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(() => new Set());
  const { workspaceId, workspaceSlug } = useWorkspace();
  const terminology = useTerminology();
  const pathname = usePathname();

  const { data: projectGoals, isLoading: projectGoalsLoading } = api.goal.getProjectGoals.useQuery(
    { projectId: projectId ?? "" },
    { enabled: !!projectId },
  );

  const { data: allGoals, isLoading: workspaceGoalsLoading } = api.goal.getAllMyGoals.useQuery(
    { workspaceId: workspaceId ?? undefined },
    { enabled: !projectId && !!workspaceId },
  );

  const isLoading = projectId ? projectGoalsLoading : workspaceGoalsLoading;
  const goalsSource = useMemo(
    () => (projectId ? (projectGoals ?? []) : (allGoals ?? [])),
    [projectId, projectGoals, allGoals],
  );

  // Filter goals by status, then nest sub-goals under whichever parent survived
  // the filter. Rows are flattened depth-first so the table stays a plain table.
  const filteredGoals = useMemo(
    () => goalsSource.filter(g => g.status === statusFilter) as unknown as GoalRow[],
    [goalsSource, statusFilter],
  );
  const goalTree = useMemo(() => buildGoalTree(filteredGoals), [filteredGoals]);
  const visibleRows = useMemo(
    () => flattenGoalTree(goalTree, collapsedIds),
    [goalTree, collapsedIds],
  );

  const toggleCollapsed = (goalId: number) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) {
        next.delete(goalId);
      } else {
        next.add(goalId);
      }
      return next;
    });
  };

  // Register lightweight page context for the AI agent (workspace goals view only —
  // the project-scoped reuse already has project context). Counts only; the agent
  // fetches the actual goals on demand via its `get-all-goals` tool.
  const goalsPageContext = useMemo(() => {
    if (projectId || !workspaceId) return null;
    return {
      pageType: "goals-list",
      pageTitle: terminology.goals,
      pagePath: pathname,
      data: { workspaceId, goalCount: filteredGoals.length, statusFilter },
    };
  }, [projectId, workspaceId, pathname, filteredGoals.length, statusFilter, terminology.goals]);
  useRegisterPageContext(goalsPageContext, { clearOnUnmount: false });


  return (
    <Container size="xl" className="py-6">
      <Stack gap="md">
        {/* Header */}
        <Group justify="space-between">
          <Title order={3} className="text-text-primary">
            Goals
          </Title>
          <CreateGoalModal projectId={projectId}>
            <ActionIcon variant="subtle" size="lg">
              <IconPlus size={18} />
            </ActionIcon>
          </CreateGoalModal>
        </Group>

        {/* Status filter tabs - pill style like Linear */}
        <Group gap="xs">
          <Badge
            variant={statusFilter === "active" ? "filled" : "light"}
            color={statusFilter === "active" ? "dark" : "gray"}
            size="lg"
            className="cursor-pointer"
            onClick={() => setStatusFilter("active")}
          >
            Active
          </Badge>
          <Badge
            variant={statusFilter === "planned" ? "filled" : "light"}
            color={statusFilter === "planned" ? "dark" : "gray"}
            size="lg"
            className="cursor-pointer"
            onClick={() => setStatusFilter("planned")}
          >
            Planned
          </Badge>
          <Badge
            variant={statusFilter === "completed" ? "filled" : "light"}
            color={statusFilter === "completed" ? "dark" : "gray"}
            size="lg"
            className="cursor-pointer"
            onClick={() => setStatusFilter("completed")}
          >
            Completed
          </Badge>
        </Group>

        {/* Table */}
        {isLoading ? (
          <Stack gap="sm">
            <Skeleton height={40} />
            <Skeleton height={50} />
            <Skeleton height={50} />
          </Stack>
        ) : filteredGoals.length > 0 ? (
          <Table verticalSpacing="sm" highlightOnHover={false}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="text-text-muted">Name</Table.Th>
                <Table.Th className="text-text-muted">Owner</Table.Th>
                <Table.Th className="text-text-muted">Target</Table.Th>
                <Table.Th className="text-text-muted">Projects</Table.Th>
                <Table.Th className="text-text-muted">Initiative Health</Table.Th>
                <Table.Th className="text-text-muted">Active Projects</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleRows.map((row) =>
                row.kind === "goal" ? (
                  <InitiativeRow
                    key={row.node.goal.id}
                    goal={row.node.goal}
                    workspaceSlug={workspaceSlug ?? ""}
                    depth={row.node.depth}
                    childCount={row.node.children.length}
                    isExpanded={!collapsedIds.has(row.node.goal.id)}
                    onToggle={() => toggleCollapsed(row.node.goal.id)}
                    goalLabel={terminology.goal}
                  />
                ) : (
                  // A project can be connected to several goals on screen, so the
                  // key needs the parent goal to stay unique.
                  <ProjectSubRow
                    key={`${row.parentGoal.id}-project-${row.project.id}`}
                    project={row.project}
                    parentGoalTitle={row.parentGoal.title}
                    workspaceSlug={workspaceSlug ?? ""}
                    depth={row.depth}
                  />
                ),
              )}
            </Table.Tbody>
          </Table>
        ) : (
          <div className="py-16 text-center">
            <IconTarget size={48} className="text-text-muted mx-auto mb-4" />
            <Text size="lg" fw={500} className="text-text-primary">
              No {statusFilter} goals
            </Text>
            <Text size="sm" c="dimmed" mt={4}>
              Create {terminology.goals.toLowerCase()} to track strategic objectives and their progress.
            </Text>
          </div>
        )}
      </Stack>
    </Container>
  );
}
