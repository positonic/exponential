"use client";

import { useState } from "react";
import { Badge, Button, Modal, Text } from "@mantine/core";
import {
  IconArrowBackUp,
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

export interface RunRowData {
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
  archived: number;
  failed: number;
  items: unknown;
  revertedAt: Date | string | null;
  triggeredBy: { id: string; name: string | null; email: string | null } | null;
}

/** A run can be reverted when it's a real pull that created tickets and
 * hasn't been reverted yet (ADR-0042: revertible at most once). */
export function isRevertible(run: RunRowData): boolean {
  return (
    run.direction === "pull" &&
    !run.dryRun &&
    run.created > 0 &&
    !run.revertedAt
  );
}

function RunRow({
  run,
  onRevert,
}: {
  run: RunRowData;
  onRevert: (runIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = parseRunItems(run.items);
  const adopted = items.filter((i) => i.action === "adopted").length;
  const deleted = items.filter((i) => i.action === "deleted").length;
  const isRevert = run.direction === "revert";

  const counts: Array<{ label: string; value: number; color: string }> = [
    { label: "deleted", value: deleted, color: "red" },
    { label: "created", value: run.created, color: "green" },
    { label: "updated", value: run.updated, color: "blue" },
    { label: "adopted", value: adopted, color: "teal" },
    { label: "skipped", value: run.skipped, color: "gray" },
    { label: "conflicts", value: run.conflicts, color: "yellow" },
    { label: "archived", value: run.archived, color: "gray" },
    { label: "failed", value: run.failed, color: "red" },
  ];

  return (
    <div
      className={`border-b border-border-primary py-2.5 last:border-b-0 ${run.dryRun ? "opacity-60" : ""}`}
    >
      <div className="flex w-full items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
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
          {isRevert && (
            <Badge size="xs" variant="light" color="orange">
              revert
            </Badge>
          )}
          {run.dryRun && (
            <Badge size="xs" variant="outline" color="gray">
              dry run
            </Badge>
          )}
          <Badge size="xs" variant="light" color={statusColor(run.status)}>
            {run.status}
          </Badge>
          {run.revertedAt && (
            <Badge size="xs" variant="outline" color="orange">
              reverted
            </Badge>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {counts
              .filter((c) => c.value > 0)
              .map((c) => (
                <Badge key={c.label} size="xs" variant="light" color={c.color}>
                  {c.value} {c.label}
                </Badge>
              ))}
          </div>
          <Text
            size="xs"
            className="text-text-muted ml-auto shrink-0 truncate max-w-40"
          >
            {run.triggeredBy?.name ?? run.triggeredBy?.email ?? "system"}
          </Text>
        </button>
        {isRevertible(run) && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="orange"
            leftSection={<IconArrowBackUp size={12} />}
            onClick={() => onRevert([run.id])}
          >
            Revert
          </Button>
        )}
      </div>
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
 * Revert preview + confirm (ADR-0042). Shows exactly what would be deleted
 * and what the local-work guardrail protects (with reasons) before anything
 * mutates; the server re-plans on execute, so this preview is advisory.
 */
function RevertModal({
  productId,
  runIds,
  onClose,
}: {
  productId: string;
  runIds: string[];
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);

  const { data: preview, isLoading, error: previewError } =
    api.product.ticketSync.previewRevert.useQuery(
      { productId, runIds },
      { retry: false },
    );

  const revert = api.product.ticketSync.revertRuns.useMutation({
    onSuccess: async () => {
      await utils.product.ticketSync.listRuns.invalidate({ productId });
      await utils.product.ticketSync.getConfig.invalidate({ productId });
      onClose();
    },
    onError: (err) => setError(err.message),
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={`Revert ${runIds.length === 1 ? "sync run" : `${runIds.length} sync runs`}`}
      size="lg"
    >
      {isLoading && (
        <Text size="sm" className="text-text-muted">
          Building revert preview…
        </Text>
      )}
      {previewError && (
        <Text size="sm" c="red">
          {previewError.message}
        </Text>
      )}
      {preview && (
        <div className="space-y-4">
          <Text size="sm" className="text-text-primary">
            This permanently deletes the{" "}
            <b>{preview.deletable.length}</b> ticket
            {preview.deletable.length === 1 ? "" : "s"} this sync created.
            Updates made by the sync to other tickets are not undone.
          </Text>

          {preview.deletable.length > 0 && (
            <div>
              <Text size="xs" fw={600} className="text-text-secondary mb-1">
                Will be deleted ({preview.deletable.length})
              </Text>
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border-primary p-2">
                {preview.deletable.map((t) => (
                  <Text key={t.ticketId} size="xs" className="text-text-primary truncate">
                    {t.title}
                  </Text>
                ))}
              </div>
            </div>
          )}

          {preview.skipped.length > 0 && (
            <div>
              <Text size="xs" fw={600} className="text-text-secondary mb-1">
                Kept — someone worked on these ({preview.skipped.length})
              </Text>
              <div className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border-primary p-2">
                {preview.skipped.map((t) => (
                  <div key={t.ticketId} className="flex gap-2 text-xs">
                    <span className="text-text-primary truncate">{t.title}</span>
                    <span className="text-text-muted truncate">
                      — {t.reasons.join("; ")}
                    </span>
                  </div>
                ))}
              </div>
              <Text size="xs" className="text-text-muted mt-1">
                Kept tickets stop syncing (their link is tombstoned) but stay
                in the backlog. Delete them individually if needed.
              </Text>
            </div>
          )}

          {error && (
            <Text size="sm" c="red">
              {error}
            </Text>
          )}

          <div className="flex justify-end gap-2">
            <Button size="xs" variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="xs"
              color="red"
              loading={revert.isPending}
              disabled={preview.deletable.length === 0 && preview.skipped.length === 0}
              onClick={() => revert.mutate({ productId, runIds })}
            >
              Delete {preview.deletable.length} ticket
              {preview.deletable.length === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * Sync run history — the persisted ledger of every run for a product's
 * Ticket sync connection (newest first), from `ticketSync.listRuns`. Unlike
 * the in-memory "last run" panel this survives refresh and navigation, and it
 * keeps showing history while the connection is disconnected. Eligible runs
 * carry a Revert action (ADR-0042).
 */
export function SyncRunHistory({ productId }: { productId: string }) {
  const [limit, setLimit] = useState(10);
  const [revertTarget, setRevertTarget] = useState<string[] | null>(null);
  const { data: runs, isLoading } = api.product.ticketSync.listRuns.useQuery(
    { productId, limit },
    { enabled: !!productId },
  );

  if (isLoading || !runs || runs.length === 0) return null;

  // Connection-wide revert is a SELECTION of all eligible runs, not a second
  // mechanism (ADR-0042) — the same run-scoped mutation and the same
  // aggregated preview/confirm flow.
  const eligibleRunIds = runs
    .filter((run) => isRevertible(run as RunRowData))
    .map((run) => run.id);

  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4">
      <div className="flex items-center gap-2">
        <IconHistory size={16} className="text-text-secondary" />
        <Text size="sm" fw={600} className="text-text-primary">
          Sync history
        </Text>
        {eligibleRunIds.length > 0 && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="orange"
            className="ml-auto"
            leftSection={<IconArrowBackUp size={12} />}
            onClick={() => setRevertTarget(eligibleRunIds)}
          >
            Remove all tickets created by this sync
          </Button>
        )}
      </div>
      <div className="mt-2">
        {runs.map((run) => (
          <RunRow
            key={run.id}
            run={run as RunRowData}
            onRevert={setRevertTarget}
          />
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
      {revertTarget && (
        <RevertModal
          productId={productId}
          runIds={revertTarget}
          onClose={() => setRevertTarget(null)}
        />
      )}
    </div>
  );
}
