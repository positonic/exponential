"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Button,
  Combobox,
  Group,
  Loader,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  useCombobox,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconAlertTriangle,
  IconArrowNarrowLeft,
  IconArrowNarrowRight,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { generateLinearId } from "~/lib/fun-ids";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  type TicketStatus,
} from "~/lib/ticket-statuses";

interface LinkedTicket {
  id: string;
  number: number;
  shortId: string | null;
  title: string;
  status: TicketStatus;
  priority: number | null;
  assignee: { id: string; name: string | null; image: string | null } | null;
}

interface Props {
  ticketId: string;
  productId: string;
  basePath: string;
  dependsOn: LinkedTicket[];
  requiredFor: LinkedTicket[];
  /** "sidebar" (default) keeps the dense PropertiesSidebar layout;
   *  "wide" adds shortId + status labels for the peek's full-width body. */
  variant?: "sidebar" | "wide";
  /** Enable display IDs (PPV-12 / fun shortId) on rows and search results. */
  productName?: string;
  funTicketIds?: boolean;
}

/**
 * Chip shown in list/table/board views when a ticket has open dependencies.
 * Red when actively blocked, muted when deps exist but ticket isn't in-flight.
 */
export function BlockedIndicator({
  openBlockerCount,
  isBlocked,
}: {
  openBlockerCount: number;
  isBlocked: boolean;
}) {
  if (openBlockerCount <= 0) return null;
  const label = isBlocked
    ? `Blocked by ${openBlockerCount} open dep${openBlockerCount === 1 ? "" : "s"}`
    : `${openBlockerCount} open dep${openBlockerCount === 1 ? "" : "s"}`;
  return (
    <Tooltip label={label} position="top" withArrow>
      <div
        className={`inline-flex items-center gap-0.5 shrink-0 ${isBlocked ? "text-brand-error" : "text-text-muted"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <IconAlertTriangle size={12} />
        <Text size="xs" fw={600}>
          {openBlockerCount}
        </Text>
      </div>
    </Tooltip>
  );
}

/**
 * Two dependency groups - "Depends on" and "Required for" - shared by the
 * ticket detail PropertiesSidebar (variant="sidebar") and the peek drawer
 * body (variant="wide"). Each group ends with the same ghost "+ Add"
 * affordance; adding swaps it for an inline search while the existing rows
 * stay visible.
 */
export function TicketDependenciesSection({
  ticketId,
  productId,
  basePath,
  dependsOn,
  requiredFor,
  variant = "sidebar",
  productName,
  funTicketIds,
}: Props) {
  const alreadyLinkedIds = new Set([
    ...dependsOn.map((t) => t.id),
    ...requiredFor.map((t) => t.id),
  ]);

  const getDisplayId = (t: { number: number; shortId: string | null }) => {
    if (funTicketIds && t.shortId) return t.shortId;
    if (productName && t.number > 0) return generateLinearId(productName, t.number);
    return null;
  };

  return (
    // Wide (peek body): content indents under the section header - chevron
    // on the left edge, content block inset - matching how Actions' cards
    // and the composer read against their headers. Groups separate at 16px
    // while label-to-rows stays 4px, so header / group / row spacing are
    // three distinct steps, not one. Sidebar keeps the flush dense layout.
    <div className={variant === "wide" ? "flex flex-col gap-4 pl-4" : "flex flex-col gap-3"}>
      <DependencySection
        icon={<IconArrowNarrowLeft size={13} />}
        label="Depends on"
        direction="out"
        tickets={dependsOn}
        ticketId={ticketId}
        productId={productId}
        basePath={basePath}
        alreadyLinkedIds={alreadyLinkedIds}
        wide={variant === "wide"}
        getDisplayId={getDisplayId}
      />
      <DependencySection
        icon={<IconArrowNarrowRight size={13} />}
        label="Required for"
        direction="in"
        tickets={requiredFor}
        ticketId={ticketId}
        productId={productId}
        basePath={basePath}
        alreadyLinkedIds={alreadyLinkedIds}
        wide={variant === "wide"}
        getDisplayId={getDisplayId}
      />
    </div>
  );
}

type GetDisplayId = (t: { number: number; shortId: string | null }) => string | null;

function DependencySection({
  icon,
  label,
  direction,
  tickets,
  ticketId,
  productId,
  basePath,
  alreadyLinkedIds,
  wide,
  getDisplayId,
}: {
  icon: React.ReactNode;
  label: string;
  direction: "out" | "in";
  tickets: LinkedTicket[];
  ticketId: string;
  productId: string;
  basePath: string;
  alreadyLinkedIds: Set<string>;
  wide: boolean;
  getDisplayId: GetDisplayId;
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div>
      {/* Icon sits in the same 14px column as the row dots and the Add plus,
          so label, ID, and Add text share one left rail. */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="inline-flex w-3.5 justify-center text-text-muted">{icon}</span>
        <Text fz={11} fw={600} className="text-text-muted uppercase tracking-wider">
          {label}
        </Text>
      </div>
      <div className="flex flex-col gap-0.5">
        {tickets.map((t) => (
          <DependencyRow
            key={t.id}
            ticket={t}
            ticketId={ticketId}
            productId={productId}
            basePath={basePath}
            direction={direction}
            wide={wide}
            getDisplayId={getDisplayId}
          />
        ))}
        {isAdding ? (
          <AddDependencyCombobox
            ticketId={ticketId}
            productId={productId}
            direction={direction}
            excludedIds={alreadyLinkedIds}
            onDone={() => setIsAdding(false)}
            getDisplayId={getDisplayId}
          />
        ) : (
          <UnstyledButton
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center gap-1.5 self-start py-0.5 text-text-muted hover:text-text-primary transition-colors"
          >
            <span className="inline-flex w-3.5 justify-center">
              <IconPlus size={12} />
            </span>
            <Text size="xs">Add</Text>
          </UnstyledButton>
        )}
      </div>
    </div>
  );
}

function DependencyRow({
  ticket,
  ticketId,
  productId,
  basePath,
  direction,
  wide,
  getDisplayId,
}: {
  ticket: LinkedTicket;
  ticketId: string;
  productId: string;
  basePath: string;
  direction: "out" | "in";
  wide: boolean;
  getDisplayId: GetDisplayId;
}) {
  const utils = api.useUtils();

  const invalidatePair = async () => {
    await Promise.all([
      utils.product.ticket.getById.invalidate({ id: ticketId }),
      utils.product.ticket.getById.invalidate({ id: ticket.id }),
      utils.product.ticket.list.invalidate({ productId }),
    ]);
  };

  const restore = api.product.ticket.addDependency.useMutation({
    onSuccess: invalidatePair,
  });

  // Removal is one unconfirmed click - the undo toast closes the loop
  // (re-adding is idempotent), matching the list's bulk-edit undo pattern.
  const remove = api.product.ticket.removeDependency.useMutation({
    onSuccess: async (_data, vars) => {
      await invalidatePair();
      const nid = `dep-removed-${vars.ticketId}-${vars.dependsOnId}`;
      notifications.show({
        id: nid,
        message: (
          <Group justify="space-between" gap="sm" wrap="nowrap">
            <Text size="sm">Dependency removed</Text>
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => {
                notifications.hide(nid);
                restore.mutate(vars);
              }}
            >
              Undo
            </Button>
          </Group>
        ),
      });
    },
  });

  const statusLabel = STATUS_LABELS[ticket.status] ?? ticket.status;
  const statusColor = STATUS_COLORS[ticket.status] ?? "gray";
  const displayId = wide ? getDisplayId(ticket) : null;

  return (
    <div className="group flex items-center gap-1.5 py-1">
      <Tooltip label={statusLabel} position="top" withArrow>
        <span className="inline-flex w-3.5 justify-center shrink-0">
          <span
            role="img"
            aria-label={`Status: ${statusLabel}`}
            className="inline-block rounded-full"
            style={{
              width: 8,
              height: 8,
              backgroundColor: `var(--mantine-color-${statusColor}-6)`,
            }}
          />
        </span>
      </Tooltip>
      {displayId && (
        <Text size="xs" className="text-text-muted font-mono shrink-0">
          {displayId}
        </Text>
      )}
      {/* Direct flex child: the click zone is the title text itself (no
          flex-grow), it truncates via min-w-0, and it centers on the row
          axis like its siblings - a wrapper div inherited the 16px body
          font and its 24.8px line-box strut pushed the title 4px off the
          shared baseline. Status stays clustered next to the title instead
          of stranded at the drawer's far edge. */}
      <Text
        size="xs"
        component={Link}
        href={`${basePath}/${ticket.id}`}
        className="min-w-0 truncate text-text-primary hover:text-brand-primary transition-colors"
      >
        {ticket.title}
      </Text>
      {wide && (
        <Text size="xs" className="text-text-muted shrink-0">
          {statusLabel}
        </Text>
      )}
      <ActionIcon
        variant="subtle"
        size="xs"
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0 text-brand-error hover:bg-surface-hover"
        onClick={(e) => {
          e.stopPropagation();
          remove.mutate(
            direction === "out"
              ? { ticketId, dependsOnId: ticket.id }
              : { ticketId: ticket.id, dependsOnId: ticketId },
          );
        }}
        disabled={remove.isPending}
        title="Remove"
      >
        <IconX size={12} />
      </ActionIcon>
    </div>
  );
}

function AddDependencyCombobox({
  ticketId,
  productId,
  direction,
  excludedIds,
  onDone,
  getDisplayId,
}: {
  ticketId: string;
  productId: string;
  direction: "out" | "in";
  excludedIds: Set<string>;
  onDone: () => void;
  getDisplayId: GetDisplayId;
}) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const combobox = useCombobox({ defaultOpened: true });
  const utils = api.useUtils();

  const { data: results, isLoading } = api.product.ticket.search.useQuery(
    { productId, query, excludeTicketId: ticketId, limit: 20 },
    { enabled: true },
  );

  const add = api.product.ticket.addDependency.useMutation({
    onSuccess: async (_data, vars) => {
      await Promise.all([
        utils.product.ticket.getById.invalidate({ id: ticketId }),
        utils.product.ticket.getById.invalidate({
          id: direction === "out" ? vars.dependsOnId : vars.ticketId,
        }),
        utils.product.ticket.list.invalidate({ productId }),
      ]);
      onDone();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const filtered = useMemo(
    () => (results ?? []).filter((t) => !excludedIds.has(t.id)),
    [results, excludedIds],
  );

  const handleSelect = (selectedId: string) => {
    setError(null);
    if (direction === "out") {
      add.mutate({ ticketId, dependsOnId: selectedId });
    } else {
      add.mutate({ ticketId: selectedId, dependsOnId: ticketId });
    }
  };

  return (
    <div>
      <Combobox store={combobox} onOptionSubmit={handleSelect} withinPortal>
        <Combobox.Target>
          <TextInput
            placeholder="Search by ID or title..."
            value={query}
            size="xs"
            autoFocus
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              setError(null);
              combobox.openDropdown();
            }}
            onFocus={() => combobox.openDropdown()}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onDone();
              }
            }}
            rightSection={
              <ActionIcon variant="subtle" size="xs" onClick={onDone} title="Cancel">
                <IconX size={12} />
              </ActionIcon>
            }
            styles={{
              input: {
                backgroundColor: "transparent",
                border: "1px solid var(--color-border-primary)",
                fontSize: "0.75rem",
                height: 26,
                minHeight: 26,
              },
            }}
          />
        </Combobox.Target>

        <Combobox.Dropdown>
          <Combobox.Options mah={280} style={{ overflowY: "auto" }}>
            {isLoading && (
              <Combobox.Empty>
                <Loader size="xs" /> Searching…
              </Combobox.Empty>
            )}
            {!isLoading && filtered.length === 0 && (
              <Combobox.Empty>No matching tickets</Combobox.Empty>
            )}
            {!isLoading &&
              filtered.map((t) => {
                const color = STATUS_COLORS[t.status] ?? "gray";
                const optionId = getDisplayId(t);
                return (
                  <Combobox.Option value={t.id} key={t.id}>
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block rounded-full shrink-0"
                        style={{
                          width: 8,
                          height: 8,
                          backgroundColor: `var(--mantine-color-${color}-6)`,
                        }}
                      />
                      {optionId && (
                        <Text size="xs" className="text-text-muted font-mono shrink-0">
                          {optionId}
                        </Text>
                      )}
                      <Text size="xs" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
                        {t.title}
                      </Text>
                      <Text size="xs" className="text-text-muted shrink-0">
                        {STATUS_LABELS[t.status] ?? t.status}
                      </Text>
                    </div>
                  </Combobox.Option>
                );
              })}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {error && (
        <Text size="xs" c="red" mt={4}>
          {error}
        </Text>
      )}
    </div>
  );
}
