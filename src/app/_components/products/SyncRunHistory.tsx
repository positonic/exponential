"use client";

import { useState } from "react";
import { Badge, Button, Text } from "@mantine/core";
import {
  IconChevronDown,
  IconChevronRight,
  IconHistory,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface RunItemView {
  externalId: string | null;
  ticketId: string | null;
  title: string;
  action: string;
  reason?: string;
}

/** Narrow the run's `items` JSON column into the per-item outcome shape. */
function parseRunItems(items: unknown): RunItemView[] {
  if (!Array.isArray(items)) return [];
  return items.filter(
    (i): i is RunItemView =>
      !!i && typeof i === "object" && typeof (i as RunItemView).title === "string",
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "success":
      return "green";
    case "error":
      return "red";
    default:
      return "blue";
  }
}

interface RunRowData {
  id: string;
  trigger: string;
  direction: string;
  dryRun: boolean;
  status: string;
  startedAt: Date | string;
  error: string | null;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  failed: number;
  items: unknown;
  triggeredBy: { id: string; name: string | null; email: string | null } | null;
}

function RunRow({ run }: { run: RunRowData }) {
  const [expanded, setExpanded] = useState(false);
  const items = parseRunItems(run.items);
  const adopted = items.filter((i) => i.action === "adopted").length;

  const counts: Array<{ label: string; value: number; color: string }> = [
    { label: "created", value: run.created, color: "green" },
    { label: "updated", value: run.updated, color: "blue" },
    { label: "adopted", value: adopted, color: "teal" },
    { label: "skipped", value: run.skipped, color: "gray" },
    { label: "conflicts", value: run.conflicts, color: "yellow" },
    { label: "failed", value: run.failed, color: "red" },
  ];

  return (
    <div
      className={`border-b border-border-primary py-2.5 last:border-b-0 ${run.dryRun ? "opacity-60" : ""}`}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setExpanded((v) => !v)}
        disabled={items.length === 0}
      >
        <span className="shrink-0 text-text-muted">
          {items.length > 0 ? (
            expanded ? (
              <IconChevronDown size={14} />
            ) : (
              <IconChevronRight size={14} />
            )
          ) : (
            <span className="inline-block w-3.5" />
          )}
        </span>
        <Text size="xs" className="text-text-primary w-40 shrink-0">
          {new Date(run.startedAt).toLocaleString()}
        </Text>
        <Text size="xs" className="text-text-muted w-16 shrink-0">
          {run.trigger}
        </Text>
        {run.dryRun && (
          <Badge size="xs" variant="outline" color="gray">
            dry run
          </Badge>
        )}
        <Badge size="xs" variant="light" color={statusColor(run.status)}>
          {run.status}
        </Badge>
        <div className="flex flex-wrap items-center gap-1.5">
          {counts
            .filter((c) => c.value > 0)
            .map((c) => (
              <Badge key={c.label} size="xs" variant="light" color={c.color}>
                {c.value} {c.label}
              </Badge>
            ))}
        </div>
        <Text size="xs" className="text-text-muted ml-auto shrink-0 truncate max-w-40">
          {run.triggeredBy?.name ?? run.triggeredBy?.email ?? "system"}
        </Text>
      </button>
      {run.error && (
        <Text size="xs" c="red" className="mt-1 ml-6">
          {run.error}
        </Text>
      )}
      {expanded && items.length > 0 && (
        <div className="mt-2 ml-6 space-y-1">
          {items.map((item, i) => (
            <div
              key={`${item.externalId ?? item.ticketId ?? i}-${i}`}
              className="flex gap-2 text-xs"
            >
              <span className="text-text-muted w-16 shrink-0">{item.action}</span>
              <span className="text-text-primary truncate">{item.title}</span>
              {item.reason && (
                <span className="text-text-muted truncate">— {item.reason}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Sync run history — the persisted ledger of every run for a product's
 * Ticket sync connection (newest first), from `ticketSync.listRuns`. Unlike
 * the in-memory "last run" panel this survives refresh and navigation, and it
 * keeps showing history while the connection is disconnected.
 */
export function SyncRunHistory({ productId }: { productId: string }) {
  const [limit, setLimit] = useState(10);
  const { data: runs, isLoading } = api.product.ticketSync.listRuns.useQuery(
    { productId, limit },
    { enabled: !!productId },
  );

  if (isLoading || !runs || runs.length === 0) return null;

  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4">
      <div className="flex items-center gap-2">
        <IconHistory size={16} className="text-text-secondary" />
        <Text size="sm" fw={600} className="text-text-primary">
          Sync history
        </Text>
      </div>
      <div className="mt-2">
        {runs.map((run) => (
          <RunRow key={run.id} run={run as RunRowData} />
        ))}
      </div>
      {runs.length === limit && (
        <Button
          size="compact-xs"
          variant="subtle"
          className="mt-2"
          onClick={() => setLimit((v) => Math.min(v + 20, 50))}
        >
          Show more
        </Button>
      )}
    </div>
  );
}
