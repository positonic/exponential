"use client";

import { useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

/**
 * "Implemented by" — the Decision Log's ONLY writable surface. Links an ADR
 * to the tickets/features that implement it. The links are user-authored
 * data: they survive repo disconnection and soft-deletion of the document.
 * ADR content itself stays read-only everywhere.
 */

interface LinkedTicket {
  id: string;
  ticket: {
    id: string;
    shortId: string | null;
    number: number;
    title: string;
    status: string;
  } | null;
  feature: { id: string; name: string; status: string } | null;
}

interface ImplementedByPickerProps {
  workspaceId: string;
  adrId: string;
  links: LinkedTicket[];
  /** Only members get the mutation UI; the list itself is always shown. */
  canEdit: boolean;
}

export function ImplementedByPicker({
  workspaceId,
  adrId,
  links,
  canEdit,
}: ImplementedByPickerProps) {
  const utils = api.useUtils();
  const [adding, setAdding] = useState(false);
  const [productId, setProductId] = useState<string | null>(null);

  const { data: products } = api.product.product.list.useQuery(
    { workspaceId },
    { enabled: adding },
  );
  const { data: tickets } = api.product.ticket.list.useQuery(
    { productId: productId ?? "" },
    { enabled: adding && !!productId },
  );
  const { data: features } = api.product.feature.list.useQuery(
    { productId: productId ?? "" },
    { enabled: adding && !!productId },
  );

  const invalidate = async () => {
    await utils.adr.get.invalidate({ workspaceId, adrId });
    await utils.adr.list.invalidate();
  };

  const link = api.adr.linkTicket.useMutation({
    onSuccess: invalidate,
    onError: (error) =>
      notifications.show({ title: "Couldn't link", message: error.message, color: "red" }),
  });
  const unlink = api.adr.unlinkTicket.useMutation({
    onSuccess: invalidate,
    onError: (error) =>
      notifications.show({ title: "Couldn't unlink", message: error.message, color: "red" }),
  });

  const linkedTicketIds = new Set(
    links.map((l) => l.ticket?.id).filter(Boolean) as string[],
  );
  const linkedFeatureIds = new Set(
    links.map((l) => l.feature?.id).filter(Boolean) as string[],
  );

  return (
    <Stack gap="xs">
      <Title order={5} className="text-text-secondary">
        Implemented by
      </Title>

      {links.length === 0 ? (
        <Text size="sm" className="text-text-muted">
          No linked tickets or features yet.
        </Text>
      ) : (
        <Stack gap={4}>
          {links.map((l) => (
            <Group key={l.id} gap="xs" wrap="nowrap">
              <Badge variant="light" color={l.ticket ? "blue" : "grape"}>
                {l.ticket ? "ticket" : "feature"}
              </Badge>
              <Text size="sm" className="min-w-0 flex-1 truncate">
                {l.ticket
                  ? `${l.ticket.shortId ?? `#${l.ticket.number}`} — ${l.ticket.title}`
                  : (l.feature?.name ?? "—")}
              </Text>
              <Text size="xs" className="text-text-muted whitespace-nowrap">
                {(l.ticket?.status ?? l.feature?.status ?? "").toLowerCase()}
              </Text>
              {canEdit ? (
                <Tooltip label="Unlink">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label="Unlink"
                    loading={unlink.isPending && unlink.variables?.linkId === l.id}
                    onClick={() => unlink.mutate({ workspaceId, linkId: l.id })}
                  >
                    <IconX size={14} />
                  </ActionIcon>
                </Tooltip>
              ) : null}
            </Group>
          ))}
        </Stack>
      )}

      {canEdit ? (
        !adding ? (
          <Button
            variant="subtle"
            size="compact-sm"
            leftSection={<IconPlus size={14} />}
            onClick={() => setAdding(true)}
            className="self-start"
          >
            Link ticket or feature
          </Button>
        ) : (
          <Group gap="xs" align="flex-end" wrap="wrap">
            <Select
              size="xs"
              w={180}
              label="Product"
              data={(products ?? []).map((p) => ({ value: p.id, label: p.name }))}
              value={productId}
              onChange={setProductId}
              searchable
              aria-label="Product"
            />
            <Select
              size="xs"
              w={260}
              label="Ticket"
              placeholder={productId ? "Pick a ticket…" : "Pick a product first"}
              data={(tickets ?? [])
                .filter((t) => !linkedTicketIds.has(t.id))
                .map((t) => ({
                  value: t.id,
                  label: `${t.shortId ?? `#${t.number}`} — ${t.title}`,
                }))}
              value={null}
              onChange={(ticketId) => {
                if (ticketId) link.mutate({ workspaceId, adrId, ticketId });
              }}
              searchable
              disabled={!productId || link.isPending}
              aria-label="Ticket"
            />
            <Select
              size="xs"
              w={220}
              label="Feature"
              placeholder={productId ? "Pick a feature…" : "Pick a product first"}
              data={(features ?? [])
                .filter((f) => !linkedFeatureIds.has(f.id))
                .map((f) => ({ value: f.id, label: f.name }))}
              value={null}
              onChange={(featureId) => {
                if (featureId) link.mutate({ workspaceId, adrId, featureId });
              }}
              searchable
              disabled={!productId || link.isPending}
              aria-label="Feature"
            />
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              onClick={() => setAdding(false)}
            >
              Done
            </Button>
          </Group>
        )
      ) : null}
    </Stack>
  );
}
