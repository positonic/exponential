"use client";

import { useMemo } from "react";
import { Badge, Text, Tooltip } from "@mantine/core";

const EPIC_STATUS_COLORS: Record<string, string> = {
  OPEN: "gray",
  IN_PROGRESS: "blue",
  DONE: "green",
  CANCELLED: "dark",
};

const EPIC_STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const EPIC_PRIORITY_LABELS: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "None",
};

interface EpicRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  priority: string;
  _count?: { actions?: number; tickets?: number };
}

export function EpicsList({
  epics,
  search,
}: {
  epics: EpicRow[];
  search: string;
  basePath: string;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return epics;
    return epics.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.description ?? "").toLowerCase().includes(q),
    );
  }, [epics, search]);

  if (filtered.length === 0) {
    return (
      <Text size="sm" className="text-text-muted py-8 text-center">
        {epics.length === 0 ? "No epics yet." : "No epics match your search."}
      </Text>
    );
  }

  return (
    <div className="border border-border-primary rounded-lg overflow-hidden">
      {filtered.map((epic, i) => {
        const statusColor = EPIC_STATUS_COLORS[epic.status] ?? "gray";
        const statusLabel = EPIC_STATUS_LABELS[epic.status] ?? epic.status;
        const isLast = i === filtered.length - 1;
        return (
          <div
            key={epic.id}
            className={`flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors ${isLast ? "" : "border-b border-border-primary"}`}
          >
            <Tooltip label={statusLabel} position="top" withArrow>
              <span
                className="inline-block rounded-full shrink-0"
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: `var(--mantine-color-${statusColor}-6)`,
                }}
              />
            </Tooltip>
            <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
              {epic.name}
            </Text>
            {epic.priority !== "NONE" && (
              <Text size="xs" className="text-text-muted shrink-0">
                {EPIC_PRIORITY_LABELS[epic.priority] ?? epic.priority}
              </Text>
            )}
            <Badge size="xs" variant="light" color="gray" className="shrink-0">
              {epic._count?.tickets ?? 0} tickets
            </Badge>
            {(epic._count?.actions ?? 0) > 0 && (
              <Badge size="xs" variant="light" color="gray" className="shrink-0">
                {epic._count?.actions} actions
              </Badge>
            )}
          </div>
        );
      })}
    </div>
  );
}
