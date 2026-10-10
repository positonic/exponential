"use client";

import { useState } from "react";
import {
  Badge,
  Button,
  Modal,
  Select,
  Switch,
  Text,
} from "@mantine/core";
import {
  IconBrandNotion,
  IconChevronDown,
  IconChevronRight,
  IconEyeSearch,
  IconPlugConnected,
  IconRefresh,
  IconUnlink,
  IconUpload,
} from "@tabler/icons-react";
import { modals } from "@mantine/modals";
import { api } from "~/trpc/react";
import { SyncRunHistory } from "./SyncRunHistory";

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

  // Disconnected = the config row survives but its integration link is null
  // (soft disconnect, or the Integration row was deleted). Links and run
  // history are intact; the picker below revives the same connection.
  const isDisconnected = !!config && !config.integrationId;

  // All the caller's Notion connections (workspace-scoped and personal) —
  // same fallback semantics the agent-side credential resolution uses.
  const { data: connections, isLoading: connectionsLoading } =
    api.integration.listNotionConnections.useQuery(undefined, {
      enabled: !!productId && (config === null || isDisconnected),
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

  const setPushEnabled = api.product.ticketSync.setPushEnabled.useMutation({
    onSuccess: invalidate,
    onError: (err) => setError(err.message),
  });

  // Backfill (ADR-0046): mirror existing non-terminal tickets to Notion. A
  // dry-run preview is mandatory before the real run (UI-level gate, like the
  // inbound first-sync preview).
  const [backfillPreview, setBackfillPreview] = useState<{
    count: number;
    sample: { ticketId: string; title: string; number: number }[];
  } | null>(null);
  const [backfillLoading, setBackfillLoading] = useState(false);

  const runBackfill = api.product.ticketSync.runBackfill.useMutation({
    onSuccess: async () => {
      setBackfillPreview(null);
      await invalidate();
    },
    onError: (err) => setError(err.message),
  });

  const onBackfill = async () => {
    setError(null);
    setBackfillLoading(true);
    try {
      const preview = await utils.product.ticketSync.backfillPreview.fetch({
        productId,
      });
      setBackfillPreview(preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview backfill");
    } finally {
      setBackfillLoading(false);
    }
  };

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

  // First-sync gate (ADR-0042): on a never-pulled connection, "Sync now"
  // first runs a dry run and shows its preview for explicit confirmation.
  // UI-level only, deliberately not server-enforced — programmatic callers
  // stay ungated; their safety net is Sync revert.
  const [gatePreview, setGatePreview] = useState<SyncOutcomeView | null>(null);

  const gateDryRun = api.product.ticketSync.syncNow.useMutation({
    onSuccess: (result) => {
      setError(null);
      setGatePreview(result as SyncOutcomeView);
    },
    onError: (err) => setError(err.message),
  });

  const onSyncNow = (neverPulled: boolean) => {
    if (neverPulled) {
      gateDryRun.mutate({ productId, dryRun: true });
    } else {
      syncNow.mutate({ productId, dryRun: false });
    }
  };

  const onDisconnect = () => {
    modals.openConfirmModal({
      title: "Disconnect Notion sync",
      children: (
        <Text size="sm">
          Disconnecting stops the sync. Tickets, their sync links, and the run
          history are all kept — reconnect anytime to pick up where you left
          off.
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
  if (config && !isDisconnected) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <IconBrandNotion
                size={22}
                className="text-text-secondary mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Text size="sm" fw={600} className="text-text-primary">
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
                  {!config.enabled && (
                    <Badge size="xs" variant="light" color="yellow">
                      Paused
                    </Badge>
                  )}
                </div>
                {/* One fact per line: the old single truncated line hid the
                    "last pulled" timestamp, which is the first thing you need
                    when a ticket looks out of date. */}
                <Text size="xs" className="text-text-muted mt-1">
                  via {config.integrationName}
                  {config.linkedTicketCount > 0 &&
                    ` · ${config.linkedTicketCount} linked ticket${config.linkedTicketCount === 1 ? "" : "s"}`}
                </Text>
                <Text size="xs" className="text-text-muted">
                  {config.lastPulledAt
                    ? `Last pulled ${new Date(config.lastPulledAt).toLocaleString()}`
                    : "Never pulled"}
                </Text>
              </div>
            </div>
            <Button
              size="xs"
              variant="subtle"
              color="red"
              className="shrink-0"
              leftSection={<IconUnlink size={14} />}
              onClick={onDisconnect}
              loading={disconnect.isPending}
            >
              Disconnect
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-1">
          <div className="flex items-start justify-between gap-4 border-b border-border-primary py-3.5">
            <div className="min-w-0">
              <Text size="sm" fw={600} className="text-text-primary">
                Dry run
              </Text>
              <Text size="xs" className="text-text-muted mt-0.5 max-w-prose">
                Shows what a sync would change, ticket by ticket and with the
                reason for each — without writing anything. Safe to run at any
                time, including while sync is paused.
              </Text>
            </div>
            <Button
              size="xs"
              variant="light"
              className="shrink-0"
              leftSection={<IconEyeSearch size={14} />}
              onClick={() => syncNow.mutate({ productId, dryRun: true })}
              loading={syncNow.isPending && syncNow.variables?.dryRun === true}
              disabled={syncNow.isPending}
            >
              Dry run
            </Button>
          </div>
          <div className="flex items-start justify-between gap-4 py-3.5">
            <div className="min-w-0">
              <Text size="sm" fw={600} className="text-text-primary">
                Sync now
              </Text>
              <Text size="xs" className="text-text-muted mt-0.5 max-w-prose">
                Pulls from Notion into Exponential immediately, instead of
                waiting for the next scheduled run. New rows become tickets, and
                changes to title, status, priority, type, effort, cycle and
                assignee land on their linked tickets.
              </Text>
              <Text size="xs" className="text-text-muted mt-1.5 max-w-prose">
                This direction only — it never writes to Notion. That&apos;s
                &quot;Push changes to Notion&quot; below.
              </Text>
              <Text size="xs" className="text-text-muted mt-1.5 max-w-prose">
                It only checks rows Notion reports as edited since the last pull
                {config.lastPulledAt
                  ? ` (${new Date(config.lastPulledAt).toLocaleString()})`
                  : ""}
                . An edit Notion didn&apos;t re-timestamp won&apos;t be seen, so
                if a ticket looks stale, run Dry run first to check whether
                it&apos;s in the window at all.
              </Text>
              {!config.enabled && (
                <Text size="xs" c="yellow" className="mt-1.5">
                  Sync is paused — turn on &quot;Sync enabled&quot; below to run
                  it.
                </Text>
              )}
            </div>
            <Button
              size="xs"
              variant="light"
              className="shrink-0"
              leftSection={<IconRefresh size={14} />}
              onClick={() => onSyncNow(!config.lastPulledAt)}
              loading={
                gateDryRun.isPending ||
                (syncNow.isPending && syncNow.variables?.dryRun !== true)
              }
              disabled={syncNow.isPending || gateDryRun.isPending || !config.enabled}
            >
              Sync now
            </Button>
          </div>
        </div>

        {lastOutcome && <SyncOutcome outcome={lastOutcome} />}

        {gatePreview && (
          <Modal
            opened
            onClose={() => setGatePreview(null)}
            title="First sync — check this is the right database"
            size="lg"
          >
            <div className="space-y-4">
              <Text size="sm" className="text-text-primary">
                This connection has never pulled. Syncing{" "}
                <b>{config.databaseName ?? "this Notion database"}</b> now would
                create <b>{gatePreview.created}</b> ticket
                {gatePreview.created === 1 ? "" : "s"} in this product
                {gatePreview.updated > 0
                  ? ` (and update ${gatePreview.updated})`
                  : ""}
                .
              </Text>
              {gatePreview.items.filter((i) => i.action === "created").length > 0 && (
                <div>
                  <Text size="xs" fw={600} className="text-text-secondary mb-1">
                    Sample of what would be created
                  </Text>
                  <div className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border-primary p-2">
                    {gatePreview.items
                      .filter((i) => i.action === "created")
                      .slice(0, 10)
                      .map((item, i) => (
                        <Text
                          key={`${item.externalId ?? i}-${i}`}
                          size="xs"
                          className="text-text-primary truncate"
                        >
                          {item.title}
                        </Text>
                      ))}
                  </div>
                </div>
              )}
              <Text size="xs" className="text-text-muted">
                Wrong database? Cancel and re-link — nothing has been created
                yet.
              </Text>
              <div className="flex justify-end gap-2">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setGatePreview(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  color="brand"
                  loading={syncNow.isPending}
                  onClick={() => {
                    setGatePreview(null);
                    syncNow.mutate({ productId, dryRun: false });
                  }}
                >
                  Looks right — sync now
                </Button>
              </div>
            </div>
          </Modal>
        )}
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
                When on, editing a linked ticket writes the change back to its
                Notion page. There is no undo for pushed changes — they land in
                your live Notion workspace.
              </Text>
            </div>
            <Switch
              size="sm"
              checked={config.pushEnabled}
              disabled={setPushEnabled.isPending}
              onChange={(e) =>
                setPushEnabled.mutate({
                  productId,
                  pushEnabled: e.currentTarget.checked,
                })
              }
            />
          </div>
          {config.pushEnabled && (
            <div className="flex items-center justify-between border-t border-border-primary py-3.5">
              <div>
                <Text size="sm" fw={600} className="text-text-primary">
                  Backfill existing tickets
                </Text>
                <Text size="xs" className="text-text-muted mt-0.5">
                  Mirror this product&apos;s open tickets to Notion. You&apos;ll
                  see exactly what would be created before anything is written.
                </Text>
              </div>
              <Button
                size="xs"
                variant="light"
                leftSection={<IconUpload size={14} />}
                onClick={onBackfill}
                loading={backfillLoading}
              >
                Backfill to Notion
              </Button>
            </div>
          )}
        </div>

        {backfillPreview && (
          <Modal
            opened
            onClose={() => setBackfillPreview(null)}
            title="Backfill tickets to Notion"
            size="lg"
          >
            <div className="space-y-4">
              <Text size="sm" className="text-text-primary">
                This will create <b>{backfillPreview.count}</b> Notion row
                {backfillPreview.count === 1 ? "" : "s"} for open tickets that
                aren&apos;t linked yet. Terminal tickets (done, deployed,
                archived) are excluded, and tickets already synced are skipped.
              </Text>
              {backfillPreview.sample.length > 0 && (
                <div>
                  <Text size="xs" fw={600} className="text-text-secondary mb-1">
                    Sample of what would be created
                  </Text>
                  <div className="max-h-48 space-y-0.5 overflow-y-auto rounded border border-border-primary p-2">
                    {backfillPreview.sample.map((item) => (
                      <Text
                        key={item.ticketId}
                        size="xs"
                        className="text-text-primary truncate"
                      >
                        #{item.number} · {item.title}
                      </Text>
                    ))}
                  </div>
                </div>
              )}
              <Text size="xs" className="text-text-muted">
                There is no undo for pushed changes — the rows land in your live
                Notion workspace.
              </Text>
              <div className="flex justify-end gap-2">
                <Button
                  size="xs"
                  variant="default"
                  onClick={() => setBackfillPreview(null)}
                >
                  Cancel
                </Button>
                <Button
                  size="xs"
                  color="brand"
                  loading={runBackfill.isPending}
                  disabled={backfillPreview.count === 0}
                  onClick={() => runBackfill.mutate({ productId })}
                >
                  Create {backfillPreview.count} row
                  {backfillPreview.count === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </Modal>
        )}

        <SyncRunHistory productId={productId} />

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Disconnected & not-connected states — pick a connection, then a database
  // -------------------------------------------------------------------------
  const hasConnections = (connections?.length ?? 0) > 0;

  const connectNotionCard = (
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

  // Disconnected: the config row (and all its sync links + run history)
  // survives with a null integration link; reconnecting revives it in place.
  if (config) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-border-primary bg-surface-secondary px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <IconBrandNotion size={22} className="text-text-secondary shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Text size="sm" fw={600} className="text-text-primary truncate">
                  {config.databaseName ?? "Notion database"}
                </Text>
                <Badge size="xs" variant="light" color="gray">
                  Disconnected
                </Badge>
              </div>
              <Text size="xs" className="text-text-muted truncate">
                Sync is disconnected
                {config.linkedTicketCount > 0 &&
                  ` · ${config.linkedTicketCount} linked ticket${config.linkedTicketCount === 1 ? "" : "s"}`}
                {" · ticket links and run history are kept"}
              </Text>
            </div>
          </div>
        </div>

        {!connectionsLoading && !hasConnections
          ? connectNotionCard
          : pickerCard(true)}

        <SyncRunHistory productId={productId} />

        {error && (
          <Text size="sm" c="red">
            {error}
          </Text>
        )}
      </div>
    );
  }

  if (!connectionsLoading && !hasConnections) {
    return connectNotionCard;
  }

  return (
    <div className="space-y-4">
      {pickerCard(false)}

      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
    </div>
  );

  function pickerCard(reconnect: boolean) {
    return (
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
            {reconnect ? "Reconnect" : "Link database"}
          </Button>
        </div>
      </div>
    );
  }
}
