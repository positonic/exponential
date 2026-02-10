"use client";

import { Group, Badge, CloseButton } from "@mantine/core";

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

interface ActiveFiltersProps {
  filters: {
    projectIds?: string[];
    statuses?: string[];
    priorities?: string[];
    listIds?: string[];
    tagIds?: string[];
    includeCompleted?: boolean;
  };
  projects?: Array<{ id: string; name: string }>;
  lists?: Array<{ id: string; name: string }>;
  tags?: Array<{ id: string; name: string }>;
  onRemoveFilter: (filterType: string, value?: string) => void;
}

export function ActiveFilters({
  filters,
  projects = [],
  lists = [],
  tags = [],
  onRemoveFilter,
}: ActiveFiltersProps) {
  const hasActiveFilters =
    (filters.projectIds?.length ?? 0) > 0 ||
    (filters.statuses?.length ?? 0) > 0 ||
    (filters.priorities?.length ?? 0) > 0 ||
    (filters.listIds?.length ?? 0) > 0 ||
    (filters.tagIds?.length ?? 0) > 0 ||
    filters.includeCompleted;

  if (!hasActiveFilters) {
    return null;
  }

  return (
    <Group
      gap="xs"
      className="pt-3 mt-3 border-t border-border-secondary"
      role="list"
      aria-label="Active filters"
    >
      {/* Project filters */}
      {filters.projectIds?.map((projectId) => {
        const project = projects.find((p) => p.id === projectId);
        if (!project) return null;
        return (
          <Badge
            key={`project-${projectId}`}
            size="md"
            variant="light"
            color="blue"
            rightSection={
              <CloseButton
                size="xs"
                onClick={() => onRemoveFilter("projectIds", projectId)}
                aria-label={`Remove ${project.name} filter`}
              />
            }
          >
            Project: {project.name}
          </Badge>
        );
      })}

      {/* Status filters */}
      {filters.statuses?.map((status) => (
        <Badge
          key={`status-${status}`}
          size="md"
          variant="light"
          color="cyan"
          rightSection={
            <CloseButton
              size="xs"
              onClick={() => onRemoveFilter("statuses", status)}
              aria-label={`Remove ${STATUS_LABELS[status] ?? status} filter`}
            />
          }
        >
          Status: {STATUS_LABELS[status] ?? status}
        </Badge>
      ))}

      {/* Priority filters */}
      {filters.priorities?.map((priority) => (
        <Badge
          key={`priority-${priority}`}
          size="md"
          variant="light"
          color="grape"
          rightSection={
            <CloseButton
              size="xs"
              onClick={() => onRemoveFilter("priorities", priority)}
              aria-label={`Remove ${priority} filter`}
            />
          }
        >
          Priority: {priority}
        </Badge>
      ))}

      {/* List filters */}
      {filters.listIds?.map((listId) => {
        const list = lists.find((l) => l.id === listId);
        if (!list) return null;
        return (
          <Badge
            key={`list-${listId}`}
            size="md"
            variant="light"
            color="teal"
            rightSection={
              <CloseButton
                size="xs"
                onClick={() => onRemoveFilter("listIds", listId)}
                aria-label={`Remove ${list.name} filter`}
              />
            }
          >
            List: {list.name}
          </Badge>
        );
      })}

      {/* Tag filters */}
      {filters.tagIds?.map((tagId) => {
        const tag = tags.find((t) => t.id === tagId);
        if (!tag) return null;
        return (
          <Badge
            key={`tag-${tagId}`}
            size="md"
            variant="light"
            color="orange"
            rightSection={
              <CloseButton
                size="xs"
                onClick={() => onRemoveFilter("tagIds", tagId)}
                aria-label={`Remove ${tag.name} filter`}
              />
            }
          >
            Tag: {tag.name}
          </Badge>
        );
      })}

      {/* Include completed filter */}
      {filters.includeCompleted && (
        <Badge
          size="md"
          variant="light"
          color="gray"
          rightSection={
            <CloseButton
              size="xs"
              onClick={() => onRemoveFilter("includeCompleted")}
              aria-label="Remove include completed filter"
            />
          }
        >
          Include completed
        </Badge>
      )}
    </Group>
  );
}
