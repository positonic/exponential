"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ActionIcon,
  Combobox,
  Loader,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  useCombobox,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowNarrowLeft,
  IconArrowNarrowRight,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
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

/**
 * Two dependency sections - "Depends on" and "Required for" - for use inside
 * `PropertiesSidebar`. Label sits on its own row, list + add button below.
 */
export function TicketDependenciesSection({
  ticketId,
  productId,
  basePath,
  dependsOn,
  requiredFor,
}: Props) {
  const alreadyLinkedIds = new Set([
    ...dependsOn.map((t) => t.id),
    ...requiredFor.map((t) => t.id),
  ]);

  return (
    <div className="flex flex-col gap-3 py-1.5">
      <DependencySection
        icon={<IconArrowNarrowLeft size={14} />}
        label="Depends on"
        direction="out"
        tickets={dependsOn}
        ticketId={ticketId}
        productId={productId}
        basePath={basePath}
        alreadyLinkedIds={alreadyLinkedIds}
      />
      <DependencySection
        icon={<IconArrowNarrowRight size={14} />}
        label="Required for"
        direction="in"
        tickets={requiredFor}
        ticketId={ticketId}
        productId={productId}
        basePath={basePath}
        alreadyLinkedIds={alreadyLinkedIds}
      />
    </div>
  );
}

function DependencySection({
  icon,
  label,
  direction,
  tickets,
  ticketId,
  productId,
  basePath,
  alreadyLinkedIds,
}: {
  icon: React.ReactNode;
  label: string;
  direction: "out" | "in";
  tickets: LinkedTicket[];
  ticketId: string;
  productId: string;
  basePath: string;
  alreadyLinkedIds: Set<string>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-text-muted">{icon}</span>
        <Text size="xs" className="text-text-muted">
          {label}
        </Text>
      </div>
      <DependencyListContent
        direction={direction}
        tickets={tickets}
        ticketId={ticketId}
        productId={productId}
        basePath={basePath}
        alreadyLinkedIds={alreadyLinkedIds}
      />
    </div>
  );
}

function DependencyListContent({
  direction,
  tickets,
  ticketId,
  productId,
  basePath,
  alreadyLinkedIds,
}: {
  direction: "out" | "in";
  tickets: LinkedTicket[];
  ticketId: string;
  productId: string;
  basePath: string;
  alreadyLinkedIds: Set<string>;
}) {
  const [isAdding, setIsAdding] = useState(false);

  if (isAdding) {
    return (
      <AddDependencyCombobox
        ticketId={ticketId}
        productId={productId}
        direction={direction}
        excludedIds={alreadyLinkedIds}
        onDone={() => setIsAdding(false)}
      />
    );
  }

  const addButton = (
    <ActionIcon
      variant="subtle"
      size="xs"
      onClick={() => setIsAdding(true)}
      title="Add dependency"
      className="shrink-0 text-text-muted hover:text-text-primary"
    >
      <IconPlus size={14} />
    </ActionIcon>
  );

  if (tickets.length === 0) {
    return (
      <div className="flex items-center">
        <UnstyledButton
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <IconPlus size={12} />
          <Text size="xs">Add</Text>
        </UnstyledButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tickets.map((t, i) => (
        <DependencyRow
          key={t.id}
          ticket={t}
          ticketId={ticketId}
          productId={productId}
          basePath={basePath}
          direction={direction}
          trailing={i === tickets.length - 1 ? addButton : null}
        />
      ))}
    </div>
  );
}

function DependencyRow({
  ticket,
  ticketId,
  productId,
  basePath,
  direction,
  trailing,
}: {
  ticket: LinkedTicket;
  ticketId: string;
  productId: string;
  basePath: string;
  direction: "out" | "in";
  trailing: React.ReactNode;
}) {
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

  const statusLabel = STATUS_LABELS[ticket.status] ?? ticket.status;
  const statusColor = STATUS_COLORS[ticket.status] ?? "gray";

  return (
    <div className="group flex items-center gap-1.5 py-0.5">
      <Tooltip label={statusLabel} position="top" withArrow>
        <span
          role="img"
          aria-label={`Status: ${statusLabel}`}
          className="inline-block rounded-full shrink-0"
          style={{
            width: 8,
            height: 8,
            backgroundColor: `var(--mantine-color-${statusColor}-6)`,
          }}
        />
      </Tooltip>
      <Text
        size="xs"
        component={Link}
        href={`${basePath}/${ticket.id}`}
        className="text-text-primary flex-1 min-w-0 hover:text-blue-400 transition-colors"
        lineClamp={1}
      >
        {ticket.title}
      </Text>
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
      {trailing}
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
                      <Text size="xs" className="text-text-primary flex-1 min-w-0" lineClamp={1}>
                        {t.title}
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
