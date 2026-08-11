"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ActionIcon,
  Badge,
  Group,
  Menu,
  Select,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconBox,
  IconCalendar,
  IconCircleDot,
  IconCopy,
  IconDots,
  IconFlag,
  IconListCheck,
  IconTicket,
  IconTrash,
  IconUser,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import {
  PropertiesSidebar,
  PropertyRow,
  PropertyDivider,
} from "~/app/_components/PropertiesSidebar";
import { PriorityIcon } from "~/app/_components/product/PriorityIcon";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { TagSelector } from "~/app/_components/TagSelector";
import { EPIC_PRIORITY_OPTIONS, EPIC_STATUS_OPTIONS } from "~/types/epic";
import type { EpicPriority, EpicStatus } from "~/types/epic";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EPIC_STATUS_COLORS: Record<string, string> = {
  OPEN: "gray",
  IN_PROGRESS: "blue",
  DONE: "green",
  CANCELLED: "dark",
};

const PRIORITY_TO_NUM: Record<string, number> = {
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  NONE: 4,
};

const TICKET_STATUS_COLORS: Record<string, string> = {
  BACKLOG: "gray",
  TODO: "gray",
  IN_PROGRESS: "blue",
  IN_REVIEW: "violet",
  QA: "orange",
  DONE: "green",
  ARCHIVED: "dark",
};

const DONE_TICKET_STATUSES = new Set(["DONE", "ARCHIVED"]);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function EpicDetailPage() {
  const router = useRouter();
  const params = useParams();
  const epicId = params.epicId as string;
  const productSlug = params.productSlug as string;
  const workspaceSlug = params.workspaceSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: epic, isLoading } = api.epic.getById.useQuery(
    { id: epicId },
    { enabled: !!epicId },
  );

  const { data: products } = api.product.product.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );

  const { data: epicTags } = api.tag.listForEntity.useQuery(
    { entityType: "epic", entityId: epicId },
    { enabled: !!epicId },
  );

  const backPath = `/w/${workspace?.slug}/products/${productSlug}/tickets`;

  const updateEpic = api.epic.update.useMutation({
    onSuccess: async () => {
      await utils.epic.getById.invalidate({ id: epicId });
      await utils.epic.list.invalidate();
    },
  });

  const setEntityTags = api.tag.setEntityTags.useMutation({
    onSuccess: async () => {
      await utils.tag.listForEntity.invalidate({
        entityType: "epic",
        entityId: epicId,
      });
    },
  });

  const deleteEpic = api.epic.delete.useMutation({
    onSuccess: async () => {
      await utils.epic.list.invalidate();
      router.push(backPath);
    },
  });

  // An epic has exactly one canonical URL: its own workspace *and* its own
  // product. `getById` gates on membership of the epic's workspace, not on
  // either slug in the address bar, so a user in two workspaces can reach a
  // foreign epic through this route and have it render under the wrong
  // breadcrumbs — and rebuilding the path from the URL's own workspace would
  // point at a product that does not exist there. Both segments therefore come
  // from the epic itself. Canonicalise rather than 404: the reader is entitled
  // to see it, just not here. A product-less epic (pre-backfill) has no
  // canonical URL yet, so it stays wherever it was opened — that is how it
  // gets assigned one.
  const canonicalPath =
    epic?.product && epic.workspace
      ? `/w/${epic.workspace.slug}/products/${epic.product.slug}/epics/${epicId}`
      : null;
  const misplaced =
    canonicalPath !== null &&
    (epic!.product!.slug !== productSlug ||
      epic!.workspace.slug !== workspaceSlug);

  useEffect(() => {
    if (misplaced && canonicalPath) router.replace(canonicalPath);
  }, [misplaced, canonicalPath, router]);

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={24} width={120} />
        <Skeleton height={36} width={400} />
        <Skeleton height={200} />
      </Stack>
    );
  }

  if (!epic) return <Text className="text-text-muted">Epic not found</Text>;

  // Redirecting to the canonical product URL — don't paint this product's
  // chrome around another product's epic in the meantime.
  if (misplaced) return null;

  // A pre-backfill epic can still hold tickets from more than one product.
  // Anything outside this epic's own product is called out rather than listed
  // as if it belonged here.
  const homeProductId = epic.product?.id ?? null;
  const foreignTickets = epic.tickets.filter(
    (t) => homeProductId != null && t.product.id !== homeProductId,
  );
  const doneCount = epic.tickets.filter((t) =>
    DONE_TICKET_STATUSES.has(t.status),
  ).length;

  const ticketHref = (t: (typeof epic.tickets)[number]) =>
    `/w/${workspace?.slug}/products/${t.product.slug}/tickets/${t.id}`;

  const ticketLabel = (t: (typeof epic.tickets)[number]) =>
    t.product.funTicketIds && t.shortId ? t.shortId : `#${t.number}`;

  return (
    <div className="flex min-h-0">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto pr-6">
        <Stack gap="lg">
          {/* Back nav */}
          <Link
            href={backPath}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <IconArrowLeft size={14} />
            Epics
          </Link>

          {/* Title + badges + overflow menu */}
          <div>
            <Group gap="sm" mb={8}>
              <Badge
                size="xs"
                variant="filled"
                color={EPIC_STATUS_COLORS[epic.status] ?? "gray"}
                styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
              >
                {EPIC_STATUS_OPTIONS.find((s) => s.value === epic.status)?.label ??
                  epic.status}
              </Badge>
              {epic.product ? (
                <Badge
                  size="xs"
                  variant="outline"
                  color="gray"
                  leftSection={<IconBox size={10} />}
                >
                  {epic.product.name}
                </Badge>
              ) : (
                <Tooltip label="Pick a product in the sidebar to finish setting this epic up">
                  <Badge
                    size="xs"
                    variant="outline"
                    color="orange"
                    leftSection={<IconAlertTriangle size={10} />}
                  >
                    No product
                  </Badge>
                </Tooltip>
              )}
            </Group>

            <Group justify="space-between" align="flex-start">
              <Text size="xl" fw={700} className="text-text-primary flex-1">
                {epic.name}
              </Text>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <ActionIcon variant="subtle" className="text-text-muted">
                    <IconDots size={18} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconCopy size={14} />}
                    onClick={() => {
                      void navigator.clipboard.writeText(window.location.href);
                    }}
                  >
                    Copy link
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => {
                      modals.openConfirmModal({
                        title: "Delete epic",
                        children: (
                          <Text size="sm">
                            This deletes the epic. Its {epic._count.tickets}{" "}
                            ticket(s) and {epic._count.actions} action(s) are
                            kept — they simply lose their epic.
                          </Text>
                        ),
                        labels: { confirm: "Delete", cancel: "Cancel" },
                        confirmProps: { color: "red" },
                        onConfirm: () => deleteEpic.mutate({ id: epicId }),
                      });
                    }}
                  >
                    Delete epic
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </div>

          {/* Description */}
          {epic.description && (
            <CollapsibleSection title="Description">
              <MarkdownRenderer content={epic.description} variant="prose" />
            </CollapsibleSection>
          )}

          {/* Tickets */}
          <CollapsibleSection
            title="Tickets"
            meta={
              epic.tickets.length > 0
                ? `${doneCount}/${epic.tickets.length} done`
                : undefined
            }
          >
            {epic.tickets.length === 0 ? (
              <Text size="sm" className="text-text-muted py-4">
                No tickets in this epic yet.
              </Text>
            ) : (
              <>
                {foreignTickets.length > 0 && (
                  <div className="mb-3 flex items-start gap-2 rounded-lg border border-border-primary px-3 py-2">
                    <IconAlertTriangle
                      size={14}
                      className="mt-0.5 shrink-0 text-text-muted"
                    />
                    <Text size="xs" className="text-text-secondary">
                      {foreignTickets.length} ticket(s) below belong to another
                      product. Epics are per-product now, so these will lose
                      their epic the next time they are edited — move them, or
                      split them into their own epic.
                    </Text>
                  </div>
                )}
                <div className="border border-border-primary rounded-lg overflow-hidden">
                  {epic.tickets.map((ticket, i) => (
                    <Link
                      key={ticket.id}
                      href={ticketHref(ticket)}
                      className={`flex items-center gap-3 px-3 py-2 hover:bg-surface-hover transition-colors ${
                        i < epic.tickets.length - 1
                          ? "border-b border-border-primary"
                          : ""
                      }`}
                    >
                      <Badge
                        size="xs"
                        variant="filled"
                        color={TICKET_STATUS_COLORS[ticket.status] ?? "gray"}
                        styles={{
                          label: { color: "var(--mantine-color-dark-9)" },
                        }}
                        className="shrink-0"
                      >
                        {ticket.status.toLowerCase().replace("_", " ")}
                      </Badge>
                      <Text size="xs" className="text-text-muted shrink-0 w-16">
                        {ticketLabel(ticket)}
                      </Text>
                      <Text
                        size="sm"
                        className="text-text-primary flex-1 min-w-0"
                        lineClamp={1}
                      >
                        {ticket.title}
                      </Text>
                      {homeProductId != null &&
                        ticket.product.id !== homeProductId && (
                          <Badge
                            size="xs"
                            variant="outline"
                            color="orange"
                            className="shrink-0"
                          >
                            {ticket.product.name}
                          </Badge>
                        )}
                      <PriorityIcon priority={ticket.priority ?? 4} size={14} />
                    </Link>
                  ))}
                </div>
              </>
            )}
          </CollapsibleSection>

          {/* Actions — an epic can hold Actions, which have no product of their
              own. Read-only here; the write path is the action's own modal. */}
          {epic.actions.length > 0 && (
            <CollapsibleSection
              title="Actions"
              meta={String(epic.actions.length)}
            >
              <div className="border border-border-primary rounded-lg overflow-hidden">
                {epic.actions.map((action, i) => (
                  <div
                    key={action.id}
                    className={`flex items-center gap-3 px-3 py-2 ${
                      i < epic.actions.length - 1
                        ? "border-b border-border-primary"
                        : ""
                    }`}
                  >
                    <Badge size="xs" variant="light" className="shrink-0">
                      {action.status.toLowerCase()}
                    </Badge>
                    <Text
                      size="sm"
                      className="text-text-primary flex-1 min-w-0"
                      lineClamp={1}
                    >
                      {action.name}
                    </Text>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}
        </Stack>
      </div>

      {/* Properties sidebar */}
      <PropertiesSidebar>
        <PropertyRow icon={<IconCircleDot size={14} />} label="Status">
          <Select
            value={epic.status}
            onChange={(val) =>
              val && updateEpic.mutate({ id: epicId, status: val as EpicStatus })
            }
            data={EPIC_STATUS_OPTIONS}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            classNames={{
              input: "text-text-primary text-xs font-medium cursor-pointer",
            }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconBox size={14} />} label="Product">
          <Select
            value={epic.product?.id ?? null}
            onChange={(val) =>
              val && updateEpic.mutate({ id: epicId, productId: val })
            }
            data={(products ?? []).map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Select a product"
            size="xs"
            variant="unstyled"
            searchable
            nothingFoundMessage="No products in this workspace"
            comboboxProps={{ withinPortal: true }}
            classNames={{
              input: "text-text-primary text-xs font-medium cursor-pointer",
            }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconFlag size={14} />} label="Priority">
          <Select
            value={epic.priority}
            onChange={(val) =>
              val &&
              updateEpic.mutate({
                id: epicId,
                priority: val as EpicPriority,
              })
            }
            data={EPIC_PRIORITY_OPTIONS}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            renderOption={({ option }) => (
              <div className="flex items-center gap-2">
                <PriorityIcon
                  priority={PRIORITY_TO_NUM[option.value] ?? 4}
                  size={14}
                />
                <span>{option.label}</span>
              </div>
            )}
            classNames={{
              input: "text-text-primary text-xs font-medium cursor-pointer",
            }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconUser size={14} />} label="Owner">
          <Text size="xs" className="text-text-primary">
            {epic.owner.name ?? epic.owner.email ?? "—"}
          </Text>
        </PropertyRow>

        <PropertyDivider />

        <PropertyRow icon={<IconCalendar size={14} />} label="Start">
          <DateInput
            value={epic.startDate ? new Date(epic.startDate) : null}
            onChange={(val) => updateEpic.mutate({ id: epicId, startDate: val })}
            placeholder="None"
            clearable
            size="xs"
            variant="unstyled"
            popoverProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyRow icon={<IconCalendar size={14} />} label="Target">
          <DateInput
            value={epic.targetDate ? new Date(epic.targetDate) : null}
            onChange={(val) => updateEpic.mutate({ id: epicId, targetDate: val })}
            placeholder="None"
            clearable
            size="xs"
            variant="unstyled"
            popoverProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        <PropertyDivider />

        <PropertyRow icon={<IconTicket size={14} />} label="Tickets">
          <Text size="xs" className="text-text-primary">
            {epic._count.tickets}
          </Text>
        </PropertyRow>

        <PropertyRow icon={<IconListCheck size={14} />} label="Actions">
          <Text size="xs" className="text-text-primary">
            {epic._count.actions}
          </Text>
        </PropertyRow>

        <PropertyDivider />

        <div className="py-1.5">
          <Text size="xs" className="text-text-muted mb-1.5">
            Labels
          </Text>
          <TagSelector
            selectedTagIds={(epicTags ?? []).map((t) => t.id)}
            onChange={(tagIds) =>
              setEntityTags.mutate({
                entityType: "epic",
                entityId: epicId,
                tagIds,
              })
            }
            workspaceId={workspaceId ?? undefined}
            categoryFilter={null}
          />
        </div>
      </PropertiesSidebar>
    </div>
  );
}
