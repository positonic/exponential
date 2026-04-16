"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Avatar,
  Badge,
  Combobox,
  Loader,
  Text,
  TextInput,
  Tooltip,
  useCombobox,
} from "@mantine/core";
import { IconAlertTriangle, IconPlus, IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import {
  STATUS_COLORS,
  STATUS_LABELS,
  type TicketStatus,
} from "~/lib/ticket-statuses";
import { generateLinearId } from "~/lib/fun-ids";

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
  productName: string;
  funTicketIds: boolean;
  basePath: string;
  dependsOn: LinkedTicket[];
  requiredFor: LinkedTicket[];
  /** Compact variant for narrow contexts like the right-side properties sidebar. */
  compact?: boolean;
}

/**
 * Small chip shown next to a ticket title in list/table/board views when it
 * has open dependencies. Red when the ticket is actively blocked (derived on
 * the server); subtle muted when deps exist but ticket isn't in-flight yet.
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
        className={`inline-flex items-center gap-0.5 shrink-0 ${isBlocked ? "text-red-400" : "text-text-muted"}`}
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

function displayId(
  t: Pick<LinkedTicket, "shortId" | "number">,
  productName: string,
  funTicketIds: boolean,
): string | null {
  if (funTicketIds && t.shortId) return t.shortId;
  if (t.number > 0) return generateLinearId(productName, t.number);
  return null;
}

export function TicketDependenciesSection({
  ticketId,
  productId,
  productName,
  funTicketIds,
  basePath,
  dependsOn,
  requiredFor,
  compact = false,
}: Props) {
  const alreadyLinkedIds = new Set([
    ...dependsOn.map((t) => t.id),
    ...requiredFor.map((t) => t.id),
  ]);
  return (
    <div className={`flex flex-col ${compact ? "gap-3" : "gap-4"}`}>
      <DependencyList
        title="Depends on"
        emptyHint="No dependencies yet."
        direction="out"
        tickets={dependsOn}
        ticketId={ticketId}
        productId={productId}
        productName={productName}
        funTicketIds={funTicketIds}
        basePath={basePath}
        alreadyLinkedIds={alreadyLinkedIds}
        compact={compact}
      />
      <DependencyList
        title="Required for"
        emptyHint="Nothing depends on this yet."
        direction="in"
        tickets={requiredFor}
        ticketId={ticketId}
        productId={productId}
        productName={productName}
        funTicketIds={funTicketIds}
        basePath={basePath}
        alreadyLinkedIds={alreadyLinkedIds}
        compact={compact}
      />
    </div>
  );
}

function DependencyList({
  title,
  emptyHint,
  direction,
  tickets,
  ticketId,
  productId,
  productName,
  funTicketIds,
  basePath,
  alreadyLinkedIds,
  compact,
}: {
  title: string;
  emptyHint: string;
  direction: "out" | "in";
  tickets: LinkedTicket[];
  ticketId: string;
  productId: string;
  productName: string;
  funTicketIds: boolean;
  basePath: string;
  alreadyLinkedIds: Set<string>;
  compact: boolean;
}) {
  const [isAdding, setIsAdding] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
          {title}
        </Text>
        {!isAdding && (
          <ActionIcon
            variant="subtle"
            size="xs"
            onClick={() => setIsAdding(true)}
            title={`Add ${title.toLowerCase()}`}
          >
            <IconPlus size={14} />
          </ActionIcon>
        )}
      </div>

      <div className="rounded-lg border border-border-primary overflow-hidden">
        {tickets.length === 0 && !isAdding && (
          <div className="px-3 py-2.5">
            <Text size="xs" className="text-text-muted">
              {emptyHint}
            </Text>
          </div>
        )}

        {tickets.map((t, i) => (
          <DependencyRow
            key={t.id}
            ticket={t}
            ticketId={ticketId}
            productId={productId}
            productName={productName}
            funTicketIds={funTicketIds}
            basePath={basePath}
            direction={direction}
            isLast={i === tickets.length - 1 && !isAdding}
            compact={compact}
          />
        ))}

        {isAdding && (
          <div
            className={`px-3 py-2 ${tickets.length > 0 ? "border-t border-border-primary" : ""}`}
          >
            <AddDependencyCombobox
              ticketId={ticketId}
              productId={productId}
              direction={direction}
              excludedIds={alreadyLinkedIds}
              onDone={() => setIsAdding(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function DependencyRow({
  ticket,
  ticketId,
  productId,
  productName,
  funTicketIds,
  basePath,
  direction,
  isLast,
  compact,
}: {
  ticket: LinkedTicket;
  ticketId: string;
  productId: string;
  productName: string;
  funTicketIds: boolean;
  basePath: string;
  direction: "out" | "in";
  isLast: boolean;
  compact: boolean;
}) {
  const router = useRouter();
  const utils = api.useUtils();

  const remove = api.product.ticket.removeDependency.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.product.ticket.getById.invalidate({ id: ticketId }),
        utils.product.ticket.getById.invalidate({ id: ticket.id }),
        utils.product.ticket.list.invalidate({ productId }),
      ]);
    },
  });

  const id = displayId(ticket, productName, funTicketIds);
  const statusLabel = STATUS_LABELS[ticket.status] ?? ticket.status;
  const statusColor = STATUS_COLORS[ticket.status] ?? "gray";

  return (
    <div
      className={`group flex items-center gap-2 ${compact ? "px-2 py-1.5" : "px-3 py-2"} hover:bg-surface-hover transition-colors cursor-pointer ${!isLast ? "border-b border-border-primary" : ""}`}
      onClick={() => router.push(`${basePath}/${ticket.id}`)}
    >
      {compact ? (
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
      ) : (
        <>
          {id && (
            <Text size="xs" className="text-text-muted font-mono shrink-0 w-14" lineClamp={1}>
              {id}
            </Text>
          )}
          <Badge
            size="xs"
            variant="filled"
            color={statusColor}
            className="shrink-0"
            styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
          >
            {statusLabel}
          </Badge>
        </>
      )}
      <Text
        size={compact ? "xs" : "sm"}
        className="text-text-primary flex-1 min-w-0"
        lineClamp={1}
      >
        {ticket.title}
      </Text>
      {!compact && ticket.assignee && (
        <Avatar size="xs" radius="xl" src={ticket.assignee.image} className="shrink-0">
          {(ticket.assignee.name ?? "?")[0]?.toUpperCase()}
        </Avatar>
      )}
      <ActionIcon
        variant="subtle"
        size="xs"
        color="red"
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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
}: {
  ticketId: string;
  productId: string;
  direction: "out" | "in";
  excludedIds: Set<string>;
  onDone: () => void;
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
      <Combobox
        store={combobox}
        onOptionSubmit={handleSelect}
        withinPortal
      >
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
                fontSize: "0.8rem",
                height: 30,
                minHeight: 30,
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
              filtered.map((t) => (
                <Combobox.Option value={t.id} key={t.id}>
                  <div className="flex items-center gap-2">
                    <Badge
                      size="xs"
                      variant="filled"
                      color={STATUS_COLORS[t.status] ?? "gray"}
                      className="shrink-0"
                      styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
                    >
                      {STATUS_LABELS[t.status] ?? t.status}
                    </Badge>
                    <Text size="sm" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
                      {t.title}
                    </Text>
                    {t.assignee && (
                      <Avatar size="xs" radius="xl" src={t.assignee.image}>
                        {(t.assignee.name ?? "?")[0]?.toUpperCase()}
                      </Avatar>
                    )}
                  </div>
                </Combobox.Option>
              ))}
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
