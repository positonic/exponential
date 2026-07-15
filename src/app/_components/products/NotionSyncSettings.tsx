"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Select,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconBrandNotion,
  IconChevronDown,
  IconChevronRight,
  IconEyeSearch,
  IconPlugConnected,
  IconRefresh,
  IconUnlink,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";

interface SyncRunItemView {
  externalId: string | null;
  ticketId: string | null;
  title: string;
  action: string;
  reason?: string;
}

interface SyncOutcomeView {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  archived?: number;
  failed: number;
  items: SyncRunItemView[];
}

interface SyncRunView {
  id: string;
  trigger: string;
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
}

function RunRow({ run }: { run: SyncRunView }) {
  const [expanded, setExpanded] = useState(false);
  const items = Array.isArray(run.items) ? (run.items as SyncRunItemView[]) : [];
  const statusColor =
    run.status === "success" ? "green" : run.status === "error" ? "red" : "yellow";

  return (
    <div className="border-t border-border-primary py-2.5 first:border-t-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? (
            <IconChevronDown size={14} className="text-text-muted shrink-0" />
          ) : (
            <IconChevronRight size={14} className="text-text-muted shrink-0" />
          )}
          <Badge size="xs" variant="light" color={statusColor}>
            {run.status}
          </Badge>
          <Text size="xs" className="text-text-secondary">
            {run.trigger}
            {run.dryRun ? " · dry run" : ""}
          </Text>
          <Text size="xs" className="text-text-muted truncate">
            {new Date(run.startedAt).toLocaleString()}
          </Text>
        </div>
        <Text size="xs" className="text-text-muted shrink-0">
          {run.created} created · {run.updated} updated · {run.skipped} skipped
          {run.conflicts > 0 ? ` · ${run.conflicts} conflicts` : ""}
          {run.archived > 0 ? ` · ${run.archived} archived` : ""}
          {run.failed > 0 ? ` · ${run.failed} failed` : ""}
        </Text>
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 pl-6">
          {run.error && (
            <Text size="xs" c="red">
              {run.error}
            </Text>
          )}
          {items.length === 0 && !run.error && (
            <Text size="xs" className="text-text-muted">
              No item-level changes recorded.
            </Text>
          )}
          {items.map((item, i) => (
            <div
              key={`${item.externalId ?? item.ticketId ?? i}-${i}`}
              className="flex gap-2 text-xs"
            >
              <span className="text-text-muted shrink-0 w-16">{item.action}</span>
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

function RunHistory({ productId }: { productId: string }) {
  const { data: runs } = api.product.ticketSync.listRuns.useQuery(
    { productId, limit: 15 },
    { enabled: !!productId, refetchInterval: 60_000 },
  );

  if (!runs || runs.length === 0) return null;

  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-3">
      <Text size="sm" fw={600} className="text-text-primary mb-1">
        Run history
      </Text>
      {runs.map((run) => (
        <RunRow key={run.id} run={run as SyncRunView} />
      ))}
    </div>
  );
}

function SyncOutcome({ outcome }: { outcome: SyncOutcomeView }) {
  const [expanded, setExpanded] = useState(false);
  const interesting = outcome.items.filter((i) => i.action !== "skipped");
  const shown = expanded ? outcome.items : interesting.slice(0, 8);

  return (
    <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4">
      <div className="flex items-center justify-between">
        <Text size="sm" fw={600} className="text-text-primary">
          {outcome.dryRun ? "Dry run result" : "Last run"}
        </Text>
        <div className="flex items-center gap-2">
          <Badge size="xs" variant="light" color="green">
            {outcome.created} created
          </Badge>
          <Badge size="xs" variant="light" color="blue">
            {outcome.updated} updated
          </Badge>
          <Badge size="xs" variant="light" color="gray">
            {outcome.skipped} skipped
          </Badge>
          {outcome.conflicts > 0 && (
            <Badge size="xs" variant="light" color="yellow">
              {outcome.conflicts} conflicts
            </Badge>
          )}
          {(outcome.archived ?? 0) > 0 && (
            <Badge size="xs" variant="light" color="gray">
              {outcome.archived} archived
            </Badge>
          )}
          {outcome.failed > 0 && (
            <Badge size="xs" variant="light" color="red">
              {outcome.failed} failed
            </Badge>
          )}
        </div>
      </div>
      {outcome.items.length > 0 && (
        <div className="mt-3 space-y-1">
          {shown.map((item, i) => (
            <div key={`${item.externalId ?? item.ticketId ?? i}-${i}`} className="flex gap-2 text-xs">
              <span className="text-text-muted shrink-0 w-16">{item.action}</span>
              <span className="text-text-primary truncate">{item.title}</span>
              {item.reason && (
                <span className="text-text-muted truncate">— {item.reason}</span>
              )}
            </div>
          ))}
          <Button
            size="compact-xs"
            variant="subtle"
            leftSection={
              expanded ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />
            }
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : `Show all ${outcome.items.length} items`}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Product ↔ Notion backlog sync configuration.
 *
 * Manages the standing link only (which Notion connection + database this
 * product's tickets mirror). Sync execution ships in later slices; until the
 * push phase lands, the sync is read-only against Notion.
 */
export function NotionSyncSettings({ productId }: { productId: string }) {
  const utils = api.useUtils();

  const { data: config, isLoading: configLoading } =
    api.product.ticketSync.getConfig.useQuery(
      { productId },
      { enabled: !!productId },
    );

  // All the caller's Notion connections (workspace-scoped and personal) —
  // same fallback semantics the agent-side credential resolution uses.
  const { data: connections, isLoading: connectionsLoading } =
    api.integration.listNotionConnections.useQuery(undefined, {
      enabled: !!productId && config === null,
    });

  const [integrationId, setIntegrationId] = useState<string | null>(null);
  const [databaseId, setDatabaseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedIntegrationId =
    integrationId ?? (connections?.length === 1 ? connections[0]!.id : null);

  const { data: databases, isLoading: databasesLoading } =
    api.integration.getNotionDatabases.useQuery(
      { integrationId: selectedIntegrationId ?? "" },
      { enabled: !!selectedIntegrationId },
    );

  const invalidate = async () => {
    await utils.product.ticketSync.getConfig.invalidate({ productId });
    await utils.product.ticketSync.listRuns.invalidate({ productId });
  };

  const saveConfig = api.product.ticketSync.saveConfig.useMutation({
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  const setEnabled = api.product.ticketSync.setEnabled.useMutation({
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  const disconnect = api.product.ticketSync.disconnect.useMutation({
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  const [lastOutcome, setLastOutcome] = useState<SyncOutcomeView | null>(null);

  const syncNow = api.product.ticketSync.syncNow.useMutation({
    onSuccess: async (result) => {
      setError(null);
      setLastOutcome(result as SyncOutcomeView);
      await invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const onDisconnect = () => {
    modals.openConfirmModal({
      title: "Disconnect Notion sync",
      children: (
        <Text size="sm">
          This removes the sync link and its run history. Tickets are not
          deleted, and reconnecting later re-links previously synced tickets.
        </Text>
      ),
      labels: { confirm: "Disconnect", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => disconnect.mutate({ productId }),
    });
  };

  if (configLoading) {
    return (
      <Text size="sm" className="text-text-muted">
        Loading sync configuration…
      </Text>
    );
  }

  // -------------------------------------------------------------------------
  // Connected state
  // -------------------------------------------------------------------------
  if (config) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <IconBrandNotion size={22} className="text-text-secondary shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Text size="sm" fw={600} className="text-text-primary truncate">
                    {config.databaseName ?? "Notion database"}
                  </Text>
                  <Badge
                    size="xs"
                    variant="light"
                    color={config.integrationStatus === "ACTIVE" ? "green" : "red"}
                  >
                    {config.integrationStatus === "ACTIVE"
                      ? "Connected"
                      : "Connection issue"}
                  </Badge>
                </div>
                <Text size="xs" className="text-text-muted truncate">
                  via {config.integrationName}
                  {config.linkedTicketCount > 0 &&
                    ` · ${config.linkedTicketCount} linked ticket${config.linkedTicketCount === 1 ? "" : "s"}`}
                  {config.lastPulledAt
                    ? ` · last pulled ${new Date(config.lastPulledAt).toLocaleString()}`
                    : " · never pulled"}
                </Text>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                size="xs"
                variant="light"
                leftSection={<IconEyeSearch size={14} />}
                onClick={() => syncNow.mutate({ productId, dryRun: true })}
                loading={syncNow.isPending && syncNow.variables?.dryRun === true}
                disabled={syncNow.isPending}
              >
                Dry run
              </Button>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconRefresh size={14} />}
                onClick={() => syncNow.mutate({ productId, dryRun: false })}
                loading={syncNow.isPending && syncNow.variables?.dryRun !== true}
                disabled={syncNow.isPending || !config.enabled}
              >
                Sync now
              </Button>
              <Button
                size="xs"
                variant="subtle"
                color="red"
                leftSection={<IconUnlink size={14} />}
                onClick={onDisconnect}
                loading={disconnect.isPending}
              >
                Disconnect
              </Button>
            </div>
          </div>
        </div>

        {lastOutcome && <SyncOutcome outcome={lastOutcome} />}

        <RunHistory productId={productId} />

        <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-1">
          <div className="flex items-center justify-between border-b border-border-primary py-3.5 last:border-b-0">
            <div>
              <Text size="sm" fw={600} className="text-text-primary">
                Sync enabled
              </Text>
              <Text size="xs" className="text-text-muted mt-0.5">
                Pause and resume syncing without losing the link.
              </Text>
            </div>
            <Switch
              size="sm"
              checked={config.enabled}
              onChange={(e) =>
                setEnabled.mutate({ productId, enabled: e.currentTarget.checked })
              }
            />
          </div>
          <div className="flex items-center justify-between py-3.5">
            <div>
              <Text size="sm" fw={600} className="text-text-primary">
                Push changes to Notion
              </Text>
              <Text size="xs" className="text-text-muted mt-0.5">
                Outbound sync is not available yet — the sync is currently
                read-only against Notion.
              </Text>
            </div>
            <Tooltip label="Coming soon — inbound sync ships first" withArrow>
              <span>
                <Switch size="sm" checked={config.pushEnabled} disabled />
              </span>
            </Tooltip>
          </div>
        </div>

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Not-connected state — pick a connection, then a database
  // -------------------------------------------------------------------------
  const hasConnections = (connections?.length ?? 0) > 0;

  if (!connectionsLoading && !hasConnections) {
    return (
      <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <IconBrandNotion size={22} className="text-text-secondary" />
            <div>
              <Text size="sm" fw={600} className="text-text-primary">
                Connect Notion first
              </Text>
              <Text size="xs" className="text-text-muted mt-0.5">
                No Notion connection found for your account. Connect Notion,
                then come back here to pick your backlog database.
              </Text>
            </div>
          </div>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlugConnected size={14} />}
            component="a"
            href="/api/auth/notion/authorize"
          >
            Connect Notion
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4 space-y-4">
        <div>
          <Text size="sm" fw={600} className="text-text-primary">
            Notion connection
          </Text>
          <Select
            className="max-w-md mt-2"
            size="xs"
            placeholder={
              connectionsLoading ? "Loading connections…" : "Select a connection…"
            }
            value={selectedIntegrationId}
            onChange={(v) => {
              setIntegrationId(v);
              setDatabaseId(null);
            }}
            data={(connections ?? []).map((c) => ({
              value: c.id,
              label: c.notionWorkspaceName
                ? `${c.notionWorkspaceName} (${c.name})`
                : c.name,
            }))}
            comboboxProps={{ withinPortal: true }}
          />
        </div>

        <div>
          <Text size="sm" fw={600} className="text-text-primary">
            Backlog database
          </Text>
          <Text size="xs" className="text-text-muted mt-0.5">
            Every row in this database will sync as a ticket in this product.
          </Text>
          <Select
            className="max-w-md mt-2"
            size="xs"
            placeholder={
              !selectedIntegrationId
                ? "Select a connection first"
                : databasesLoading
                  ? "Loading databases…"
                  : "Select a database…"
            }
            disabled={!selectedIntegrationId}
            value={databaseId}
            onChange={setDatabaseId}
            searchable
            data={(databases ?? []).map((db: { id: string; title: string }) => ({
              value: db.id,
              label: db.title,
            }))}
            comboboxProps={{ withinPortal: true }}
          />
        </div>

        <div className="flex justify-end">
          <Button
            size="xs"
            color="brand"
            leftSection={<IconPlugConnected size={14} />}
            disabled={!selectedIntegrationId || !databaseId}
            loading={saveConfig.isPending}
            onClick={() => {
              if (!selectedIntegrationId || !databaseId) return;
              setError(null);
              const db = (databases ?? []).find(
                (d: { id: string }) => d.id === databaseId,
              ) as { id: string; title?: string } | undefined;
              saveConfig.mutate({
                productId,
                integrationId: selectedIntegrationId,
                databaseId,
                databaseName: db?.title,
              });
            }}
          >
            Link database
          </Button>
        </div>
      </div>

      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
    </div>
  );
}
