"use client";

import { Avatar, Badge, Group, Progress, Table, Text } from "@mantine/core";
import { IconUsers } from "@tabler/icons-react";
import { relativeTimeLabel } from "~/plugins/okr/client/utils/okrDashboardUtils";
import type { Confidence } from "~/plugins/okr/client/utils/okrDashboardUtils";
import { formatKrValue, type KeyResultRowData } from "./keyResultRows";

const CONFIDENCE_BADGE: Record<Confidence, { color: string; label: string }> = {
  ok: { color: "green", label: "On track" },
  warn: { color: "yellow", label: "At risk" },
  bad: { color: "red", label: "Off track" },
  idle: { color: "gray", label: "Not started" },
};

interface KeyResultsTableProps {
  rows: KeyResultRowData[];
  /** Activating a row opens the key result's drawer. */
  onRowClick: (row: KeyResultRowData) => void;
}

/**
 * The Key results view of the Goals page: every key result of the objectives
 * in the current list as one flat table. Which rows are here is the shell's
 * business (period scope, Mine, search, Filter); this renders what it is
 * handed.
 */
export function KeyResultsTable({ rows, onRowClick }: KeyResultsTableProps) {
  return (
    <Table verticalSpacing="sm" highlightOnHover={false} data-testid="key-results-table">
      <Table.Thead>
        <Table.Tr>
          <Table.Th className="text-text-muted">Key result</Table.Th>
          <Table.Th className="text-text-muted">Objective</Table.Th>
          <Table.Th className="text-text-muted">Owner</Table.Th>
          <Table.Th className="text-text-muted">Current / target</Table.Th>
          <Table.Th className="text-text-muted">Progress</Table.Th>
          <Table.Th className="text-text-muted">Status</Table.Th>
          <Table.Th className="text-text-muted">Last check-in</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => {
          const badge = CONFIDENCE_BADGE[row.confidence];
          return (
            <Table.Tr
              key={row.id}
              className="cursor-pointer hover:bg-surface-hover transition-colors"
              data-key-result-id={row.id}
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(row)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onRowClick(row);
                }
              }}
            >
              <Table.Td>
                <Text size="sm" fw={500} className="text-text-primary" lineClamp={2}>
                  {row.title}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" className="text-text-secondary" lineClamp={1}>
                  {row.objectiveTitle}
                </Text>
              </Table.Td>
              <Table.Td>
                {row.driUser ? (
                  <Group gap={6} wrap="nowrap">
                    <Avatar
                      src={row.driUser.image}
                      name={row.driUser.name ?? undefined}
                      size={20}
                      radius="xl"
                    />
                    <Text size="sm" className="text-text-primary" truncate="end">
                      {row.driUser.name ?? row.driUser.email ?? "Unknown"}
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
              <Table.Td>
                <Text size="sm" className="text-text-primary">
                  {formatKrValue(row.currentValue, row.unit, row.unitLabel)}
                  <Text component="span" size="sm" c="dimmed">
                    {" "}
                    / {formatKrValue(row.targetValue, row.unit, row.unitLabel)}
                  </Text>
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={8} wrap="nowrap">
                  <Progress value={row.progress} size="sm" w={80} color={badge.color} />
                  <Text size="sm" className="text-text-secondary">
                    {row.progress}%
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td>
                <Badge size="sm" variant="light" color={badge.color}>
                  {badge.label}
                </Badge>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed">
                  {row.lastCheckInAt ? relativeTimeLabel(row.lastCheckInAt) : "never"}
                </Text>
              </Table.Td>
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
