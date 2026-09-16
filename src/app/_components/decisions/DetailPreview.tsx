"use client";

import { Badge, Group, Skeleton, Text, Title } from "@mantine/core";

/**
 * The first paint of a decision or ADR detail, built from what the Decision
 * Log row already knows (label, title, status). The peek drawer shows it
 * while the detail chunk or query is still on its way, so opening a row
 * paints its header on the same frame instead of a blank skeleton. Kept free
 * of data fetching and heavy imports: it is also the Suspense fallback for
 * the code-split detail views.
 */

export interface StatusBadge {
  label: string;
  color: string;
}

export interface PeekPreview {
  label: string | null;
  title: string;
  badge: StatusBadge;
}

const STATUS_COLOR: Record<string, string> = {
  OPEN: "yellow",
  PROPOSED: "blue",
  ACCEPTED: "green",
  SUPERSEDED: "orange",
  DEPRECATED: "red",
};

const DECISION_STATUS_LABEL: Record<string, string> = {
  OPEN: "open question",
  PROPOSED: "proposed",
  ACCEPTED: "accepted",
  SUPERSEDED: "superseded",
  DEPRECATED: "deprecated",
};

/** The status badge a Decision's detail header shows. */
export function decisionStatusBadge(status: string): StatusBadge {
  return {
    label: DECISION_STATUS_LABEL[status] ?? status.toLowerCase(),
    color: STATUS_COLOR[status] ?? "gray",
  };
}

/** The status badge an ADR's detail header shows. */
export function adrStatusBadge(status: string): StatusBadge {
  if (status === "UNKNOWN") return { label: "no status", color: "gray" };
  return { label: status.toLowerCase(), color: STATUS_COLOR[status] ?? "gray" };
}

export function DetailPreview({ preview }: { preview?: PeekPreview }) {
  if (!preview) {
    return (
      <>
        <Skeleton height={40} width={280} mb="lg" />
        <Skeleton height={400} />
      </>
    );
  }
  // Mirrors the loaded header's structure so nothing jumps when it lands.
  return (
    <div aria-busy="true">
      <Group justify="space-between" align="flex-start" mt="md" mb="xs" wrap="nowrap">
        <div className="min-w-0">
          <Group gap="sm" mb={4}>
            {preview.label ? (
              <Text size="sm" fw={700} className="text-text-secondary">
                {preview.label}
              </Text>
            ) : null}
            <Badge variant="light" color={preview.badge.color}>
              {preview.badge.label}
            </Badge>
          </Group>
          <Title order={2}>{preview.title}</Title>
          <Skeleton height={22} width={240} mt={6} />
        </div>
      </Group>
      <Skeleton height={16} width="60%" mt="md" />
      <Skeleton height={240} mt="lg" />
    </div>
  );
}
