"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useDisclosure } from "@mantine/hooks";
import { CreateActionModal } from "~/app/_components/CreateActionModal";
import { EditActionModal } from "~/app/_components/EditActionModal";
import {
  ActionIcon,
  Anchor,
  Avatar,
  Badge,
  Button,
  Checkbox,
  CheckIcon,
  Combobox,
  Group,
  Menu,
  NumberInput,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  useCombobox,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconArrowLeft,
  IconBug,
  IconCalendar,
  IconCategory,
  IconChevronDown,
  IconChevronRight,
  IconCircleDot,
  IconClock,
  IconCopy,
  IconDots,
  IconFlag,
  IconFlame,
  IconFolder,
  IconGitBranch,
  IconLink,
  IconPlus,
  IconRocket,
  IconTag,
  IconTool,
  IconTrash,
  IconUser,
  IconX,
} from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import {
  PropertiesSidebar,
  PropertyRow,
  PropertyDivider,
} from "~/app/_components/PropertiesSidebar";
import { generateLinearId } from "~/lib/fun-ids";
import { PriorityIcon } from "~/app/_components/product/PriorityIcon";
import { TicketDependenciesSection } from "~/app/_components/product/TicketDependenciesSection";
import { LabelsCombobox } from "~/app/_components/product/LabelsCombobox";
import {
  STATUS_OPTIONS,
  STATUS_COLORS,
  type TicketStatus,
} from "~/lib/ticket-statuses";
import { TagBadge } from "~/app/_components/TagBadge";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { TicketBodyEditor } from "~/app/_components/product/TicketBodyEditor";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS = [
  { value: "0", label: "Urgent" },
  { value: "1", label: "High" },
  { value: "2", label: "Medium" },
  { value: "3", label: "Low" },
  { value: "4", label: "No priority" },
];

function PrioritySelectOption({ option }: { option: { value: string; label: string } }) {
  return (
    <div className="flex items-center gap-2">
      <PriorityIcon priority={Number(option.value)} size={14} />
      <span>{option.label}</span>
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: "BUG", label: "Bug" },
  { value: "FEATURE", label: "Feature" },
  { value: "CHORE", label: "Chore" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "SPIKE", label: "Spike" },
  { value: "RESEARCH", label: "Research" },
];

const TYPE_ICONS: Record<string, React.ReactNode> = {
  BUG: <IconBug size={14} />,
  FEATURE: <IconRocket size={14} />,
  CHORE: <IconTool size={14} />,
  IMPROVEMENT: <IconRocket size={14} />,
  SPIKE: <IconFlame size={14} />,
  RESEARCH: <IconCategory size={14} />,
};

const TYPE_COLORS: Record<string, string> = {
  BUG: "red",
  FEATURE: "blue",
  CHORE: "gray",
  IMPROVEMENT: "teal",
  SPIKE: "violet",
  RESEARCH: "yellow",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDisplayId(ticket: {
  shortId: string | null;
  number: number;
  product: { name: string; funTicketIds: boolean };
}) {
  if (ticket.product.funTicketIds && ticket.shortId) return ticket.shortId;
  if (ticket.number > 0) return generateLinearId(ticket.product.name, ticket.number);
  return null;
}

// ---------------------------------------------------------------------------
// Combobox: Epic (single-select with create)
// ---------------------------------------------------------------------------

function EpicCombobox({
  value,
  epics,
  onChange,
  onCreate,
}: {
  value: string | null;
  epics: Array<{ id: string; name: string }>;
  onChange: (val: string | null) => void;
  onCreate: (name: string) => void;
}) {
  const combobox = useCombobox({ onDropdownClose: () => { combobox.resetSelectedOption(); setSearch(""); } });
  const [search, setSearch] = useState("");

  const selected = epics.find((e) => e.id === value);
  const filtered = epics.filter((e) => e.name.toLowerCase().includes(search.toLowerCase().trim()));
  const exactMatch = epics.some((e) => e.name.toLowerCase() === search.toLowerCase().trim());

  return (
    <Combobox store={combobox} onOptionSubmit={(val) => {
      if (val === "__create") {
        onCreate(search.trim());
      } else if (val === "__clear") {
        onChange(null);
      } else {
        onChange(val);
      }
      combobox.closeDropdown();
    }}>
      <Combobox.Target>
        <TextInput
          value={combobox.dropdownOpened ? search : (selected?.name ?? "")}
          onChange={(e) => { setSearch(e.currentTarget.value); combobox.openDropdown(); combobox.updateSelectedOptionIndex(); }}
          onClick={() => combobox.toggleDropdown()}
          onFocus={() => { combobox.openDropdown(); setSearch(""); }}
          onBlur={() => combobox.closeDropdown()}
          placeholder="None"
          size="xs"
          variant="unstyled"
          classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
          styles={{ input: { height: 24, minHeight: 24 } }}
        />
      </Combobox.Target>
      <Combobox.Dropdown>
        <Combobox.Options>
          {value && (
            <Combobox.Option value="__clear" className="text-text-muted">
              <Text size="xs">Clear</Text>
            </Combobox.Option>
          )}
          {filtered.map((e) => (
            <Combobox.Option key={e.id} value={e.id} active={e.id === value}>
              <div className="flex items-center gap-2">
                {e.id === value && <CheckIcon size={12} />}
                <Text size="xs">{e.name}</Text>
              </div>
            </Combobox.Option>
          ))}
          {search.trim() && !exactMatch && (
            <Combobox.Option value="__create">
              <Text size="xs" className="text-blue-400">+ Create &quot;{search.trim()}&quot;</Text>
            </Combobox.Option>
          )}
          {!search.trim() && filtered.length === 0 && (
            <Combobox.Empty>
              <Text size="xs" className="text-text-muted">No epics</Text>
            </Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

// ---------------------------------------------------------------------------
// Linked Actions Section
// ---------------------------------------------------------------------------

interface LinkedAction {
  id: string;
  name: string;
  description: string | null;
  status: string;
  kanbanStatus: string | null;
  priority: string | null;
  dueDate: Date | string | null;
  projectId: string | null;
  workspaceId?: string | null;
  assignees: Array<{ user: { id: string; name: string | null; image: string | null } }>;
}

function getActionPriorityBorderColor(priority: string | null): string {
  switch (priority) {
    case "1st Priority": return "var(--mantine-color-red-filled)";
    case "2nd Priority": return "var(--mantine-color-orange-filled)";
    case "3rd Priority": return "var(--mantine-color-yellow-filled)";
    case "4th Priority": return "var(--mantine-color-green-filled)";
    case "5th Priority": return "var(--mantine-color-blue-filled)";
    case "Quick": return "var(--mantine-color-violet-filled)";
    case "Scheduled": return "var(--mantine-color-pink-filled)";
    case "Errand": return "var(--mantine-color-cyan-filled)";
    case "Remember": return "var(--mantine-color-indigo-filled)";
    case "Watch": return "var(--mantine-color-grape-filled)";
    default: return "var(--color-border-primary)";
  }
}

function ActionRow({
  action,
  isDone,
  onToggle,
  onUnlink,
  onOpen,
  unlinkPending,
}: {
  action: LinkedAction;
  isDone: boolean;
  onToggle: (action: LinkedAction, checked: boolean) => void;
  onUnlink: (id: string) => void;
  onOpen: (action: LinkedAction) => void;
  unlinkPending: boolean;
}) {
  return (
    <div
      className="border border-border-primary rounded-lg px-3 py-2 flex items-center gap-2 group cursor-pointer hover:bg-surface-hover transition-colors"
      onClick={() => onOpen(action)}
    >
      {/* Circular checkbox */}
      <div
        className="shrink-0"
        onClick={(e) => { e.stopPropagation(); onToggle(action, !isDone); }}
      >
        <Checkbox
          size="xs"
          radius="xl"
          checked={isDone}
          readOnly
          styles={{
            input: {
              borderColor: isDone ? "var(--mantine-color-green-filled)" : getActionPriorityBorderColor(action.priority),
              backgroundColor: isDone ? "var(--mantine-color-green-filled)" : "transparent",
              cursor: "pointer",
            },
          }}
        />
      </div>

      {/* Name */}
      <Text
        size="sm"
        className={`flex-1 min-w-0 truncate ${isDone ? "line-through opacity-30" : "text-text-primary"}`}
      >
        {action.name}
      </Text>

      {/* Assignees */}
      {action.assignees.length > 0 && (
        <Avatar.Group spacing="xs">
          {action.assignees.slice(0, 2).map((a) => (
            <Avatar key={a.user.id} src={a.user.image} size={18} radius="xl" title={a.user.name ?? ""}>
              {(a.user.name ?? "?")[0]?.toUpperCase()}
            </Avatar>
          ))}
        </Avatar.Group>
      )}

      {/* Due date */}
      {action.dueDate && (
        <Text size="xs" className="text-text-muted shrink-0">
          {new Date(action.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </Text>
      )}

      {/* Unlink */}
      <ActionIcon
        variant="subtle"
        size="xs"
        className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-opacity shrink-0"
        onClick={(e) => { e.stopPropagation(); onUnlink(action.id); }}
        loading={unlinkPending}
      >
        <IconX size={12} />
      </ActionIcon>
    </div>
  );
}

function LinkedActionsSection({
  ticketId,
  actions,
  workspaceId,
  onChanged,
}: {
  ticketId: string;
  actions: LinkedAction[];
  workspaceId: string | null;
  onChanged: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState("");
  const [pendingName, setPendingName] = useState("");
  const [createModalOpen, { open: openCreateModal, close: closeCreateModal }] = useDisclosure(false);
  const [editingAction, setEditingAction] = useState<LinkedAction | null>(null);
  const combobox = useCombobox({
    onDropdownClose: () => { combobox.resetSelectedOption(); },
  });

  const { data: searchResults } = api.action.searchForDependencies.useQuery(
    { query: search, workspaceId: workspaceId ?? undefined, limit: 8 },
    { enabled: search.trim().length > 0 },
  );

  const linkAction = api.product.ticket.linkAction.useMutation({
    onSuccess: () => { setSearch(""); onChanged(); },
  });
  const unlinkAction = api.product.ticket.unlinkAction.useMutation({ onSuccess: onChanged });
  const updateActionStatus = api.action.update.useMutation({ onSuccess: onChanged });

  const linkedIds = new Set(actions.map((a) => a.id));
  const suggestions = (searchResults ?? []).filter((r) => !linkedIds.has(r.id));
  const trimmed = search.trim();
  const hasExactMatch = suggestions.some(
    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const isDone = (a: LinkedAction) =>
    a.kanbanStatus === "DONE" || a.status === "COMPLETED";

  const activeActions = actions.filter((a) => !isDone(a));
  const doneActions = actions.filter((a) => isDone(a));

  const handleToggle = (action: LinkedAction, checked: boolean) => {
    updateActionStatus.mutate({
      id: action.id,
      status: checked ? "COMPLETED" : "ACTIVE",
      kanbanStatus: checked ? "DONE" : "TODO",
    });
  };

  const handleSelect = (value: string) => {
    if (value === "__create") {
      setPendingName(trimmed);
      setSearch("");
      combobox.closeDropdown();
      openCreateModal();
    } else {
      linkAction.mutate({ ticketId, actionId: value });
      setSearch("");
      combobox.closeDropdown();
    }
  };

  return (
    <div className="mt-4">
      {/* Header - matches Activity style */}
      <button
        className="flex items-center gap-1.5 mb-3"
        onClick={() => setCollapsed((v) => !v)}
      >
        {collapsed
          ? <IconChevronRight size={13} className="text-text-muted" />
          : <IconChevronDown size={13} className="text-text-muted" />}
        <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
          Actions{actions.length > 0 ? ` (${actions.length})` : ""}
        </Text>
      </button>

      {!collapsed && (
        <div>
          {/* Active action rows */}
          {activeActions.length > 0 && (
            <Stack gap="xs" mb="xs">
              {activeActions.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  isDone={false}
                  onToggle={handleToggle}
                  onOpen={setEditingAction}
                  onUnlink={(id) => unlinkAction.mutate({ actionId: id })}
                  unlinkPending={unlinkAction.isPending}
                />
              ))}
            </Stack>
          )}

          {/* Completed actions */}
          {doneActions.length > 0 && (
            <div className="mt-2 mb-2">
              <Text size="xs" className="text-text-muted opacity-50 mb-1.5 pl-1" style={{ fontSize: "0.65rem", letterSpacing: "0.04em" }}>
                Completed
              </Text>
              <Stack gap="xs">
                {doneActions.map((action) => (
                  <ActionRow
                    key={action.id}
                    action={action}
                    isDone={true}
                    onToggle={handleToggle}
                    onOpen={setEditingAction}
                    onUnlink={(id) => unlinkAction.mutate({ actionId: id })}
                    unlinkPending={unlinkAction.isPending}
                  />
                ))}
              </Stack>
            </div>
          )}

          {/* Notion-style combobox - always visible */}
          <Combobox store={combobox} onOptionSubmit={handleSelect}>
            <Combobox.Target>
              <TextInput
                placeholder="Link or create an action..."
                value={search}
                onChange={(e) => {
                  setSearch(e.currentTarget.value);
                  combobox.openDropdown();
                  combobox.updateSelectedOptionIndex();
                }}
                onFocus={() => { if (search.trim()) combobox.openDropdown(); }}
                onBlur={() => combobox.closeDropdown()}
                size="xs"
                leftSection={<IconPlus size={13} className="text-text-muted" />}
                styles={{
                  input: {
                    backgroundColor: "transparent",
                    border: "1px solid var(--color-border-primary)",
                    fontSize: "0.8rem",
                    color: "var(--color-text-secondary)",
                  },
                }}
              />
            </Combobox.Target>

            {(suggestions.length > 0 || (trimmed && !hasExactMatch)) && (
              <Combobox.Dropdown>
                <Combobox.Options>
                  {suggestions.map((r) => (
                    <Combobox.Option key={r.id} value={r.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.kanbanStatus === "DONE" ? "bg-green-500" : "bg-border-primary"}`}
                        />
                        <Text size="xs" className="flex-1">{r.name}</Text>
                        {r.project && (
                          <Text size="xs" className="text-text-muted">{r.project.name}</Text>
                        )}
                      </div>
                    </Combobox.Option>
                  ))}
                  {trimmed && !hasExactMatch && (
                    <Combobox.Option value="__create">
                      <div className="flex items-center gap-2">
                        <IconPlus size={12} className="text-text-muted" />
                        <Text size="xs">
                          Create <span className="font-medium">&quot;{trimmed}&quot;</span>
                        </Text>
                      </div>
                    </Combobox.Option>
                  )}
                </Combobox.Options>
              </Combobox.Dropdown>
            )}
          </Combobox>

          {/* Create action modal - opened when user picks "Create xyz" */}
          <CreateActionModal
            viewName="ticket"
            initialName={pendingName}
            externalOpened={createModalOpen}
            onExternalClose={closeCreateModal}
            onActionCreated={(actionId) => { linkAction.mutate({ ticketId, actionId }); setPendingName(""); }}
          />
        </div>
      )}

      {/* Edit action modal - opened when clicking a row */}
      <EditActionModal
        action={editingAction as unknown as Parameters<typeof EditActionModal>[0]["action"]}
        opened={editingAction !== null}
        onClose={() => setEditingAction(null)}
        onSuccess={() => { setEditingAction(null); onChanged(); }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function TicketDetailPage() {
  const router = useRouter();
  const params = useParams();
  const ticketId = params.ticketId as string;
  const productSlug = params.productSlug as string;
  const { workspace, workspaceId } = useWorkspace();
  const utils = api.useUtils();

  const { data: ticket, isLoading } = api.product.ticket.getById.useQuery(
    { id: ticketId },
    { enabled: !!ticketId },
  );

  // Data for selectors
  const members = workspace?.members ?? [];
  const { data: cycles } = api.product.cycle.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const { data: epics } = api.epic.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const { data: features } = api.product.feature.list.useQuery(
    { productId: ticket?.product.id ?? "" },
    { enabled: !!ticket?.product.id },
  );
  const { data: tags } = api.tag.list.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId },
  );
  const setTicketTags = api.tag.setTicketTags.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.getById.invalidate({ id: ticketId });
    },
  });
  const createTag = api.tag.create.useMutation({
    onSuccess: async (newTag) => {
      await utils.tag.list.invalidate();
      // Auto-add new tag to this ticket
      const currentIds = ticket?.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? [];
      setTicketTags.mutate({ ticketId, tagIds: [...currentIds, newTag.id] });
    },
  });
  const createEpic = api.epic.create.useMutation({
    onSuccess: async (newEpic) => {
      await utils.epic.list.invalidate();
      handleFieldUpdate("epicId", newEpic.id);
    },
  });

  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<TicketStatus | null>(null);
  const [titleValue, setTitleValue] = useState(ticket?.title ?? "");
  const [activityCollapsed, setActivityCollapsed] = useState(false);

  useEffect(() => {
    if (ticket) {
      setStatus(ticket.status);
      setTitleValue(ticket.title);
    }
  }, [ticket]);

  const updateTicket = api.product.ticket.update.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.getById.invalidate({ id: ticketId });
      if (ticket?.product.id) {
        await utils.product.ticket.list.invalidate({ productId: ticket.product.id });
      }
    },
  });

  const deleteTicket = api.product.ticket.delete.useMutation({
    onSuccess: async () => {
      if (ticket?.product.id) {
        await utils.product.ticket.list.invalidate({ productId: ticket.product.id });
      }
      if (workspace) {
        router.push(`/w/${workspace.slug}/products/${productSlug}/tickets`);
      }
    },
  });

  const addComment = api.product.ticket.addComment.useMutation({
    onSuccess: async () => {
      setComment("");
      await utils.product.ticket.getById.invalidate({ id: ticketId });
    },
  });

  const deleteComment = api.product.ticket.deleteComment.useMutation({
    onSuccess: async () => {
      await utils.product.ticket.getById.invalidate({ id: ticketId });
    },
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={24} width={120} />
        <Skeleton height={36} width={400} />
        <Skeleton height={200} />
      </Stack>
    );
  }
  if (!ticket) return <Text className="text-text-muted">Ticket not found</Text>;

  const handleFieldUpdate = (field: string, value: unknown) => {
    updateTicket.mutate({ id: ticketId, [field]: value });
  };

  const onStatusChange = (val: string | null) => {
    if (!val) return;
    setStatus(val as TicketStatus);
    handleFieldUpdate("status", val);
  };

  const onDelete = () => {
    modals.openConfirmModal({
      title: "Delete ticket",
      children: <Text size="sm">This will permanently delete the ticket and all comments.</Text>,
      labels: { confirm: "Delete", cancel: "Cancel" },
      confirmProps: { color: "red" },
      onConfirm: () => deleteTicket.mutate({ id: ticketId }),
    });
  };

  const backPath = `/w/${workspace?.slug}/products/${productSlug}/tickets`;
  const displayId = getDisplayId(ticket);

  return (
    <div className="flex min-h-0">
      {/* Main content */}
      <div className="flex-1 overflow-y-auto pr-6">
        <Stack gap="lg">
          {/* Back nav + identifier */}
          <div>
            <Link
              href={backPath}
              className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              <IconArrowLeft size={14} />
              Backlog
            </Link>
          </div>

          {/* Type badge + ID + title + overflow menu */}
          <div>
            <Group gap="sm" mb={8}>
              <Badge
                size="xs"
                variant="light"
                color={TYPE_COLORS[ticket.type] ?? "gray"}
                leftSection={TYPE_ICONS[ticket.type]}
              >
                {ticket.type.toLowerCase()}
              </Badge>
              <Badge
                size="xs"
                variant="filled"
                color={STATUS_COLORS[ticket.status] ?? "gray"}
                styles={{ label: { color: "var(--mantine-color-dark-9)" } }}
              >
                {STATUS_OPTIONS.find((s) => s.value === ticket.status)?.label ?? ticket.status}
              </Badge>
              {displayId && (
                <Text size="xs" className="text-text-muted font-mono">
                  {displayId}
                </Text>
              )}
            </Group>

            <Group justify="space-between" align="flex-start">
              <Textarea
                value={titleValue}
                onChange={(e) => setTitleValue(e.currentTarget.value)}
                autosize
                minRows={1}
                maxRows={3}
                variant="unstyled"
                classNames={{ input: "text-text-primary font-bold text-xl p-0 leading-tight resize-none" }}
                styles={{ root: { flex: 1 }, input: { fontWeight: 700, fontSize: "1.25rem" } }}
                onBlur={() => {
                  const trimmed = titleValue.trim();
                  if (trimmed && trimmed !== ticket.title) {
                    handleFieldUpdate("title", trimmed);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
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
                      const url = window.location.href;
                      void navigator.clipboard.writeText(url);
                    }}
                  >
                    Copy link
                  </Menu.Item>
                  {displayId && (
                    <Menu.Item
                      leftSection={<IconCopy size={14} />}
                      onClick={() => {
                        void navigator.clipboard.writeText(displayId);
                      }}
                    >
                      Copy ID
                    </Menu.Item>
                  )}
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={onDelete}
                  >
                    Delete ticket
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </div>

          {/* Tags */}
          {ticket.tags && ticket.tags.length > 0 && (
            <Group gap="xs">
              {ticket.tags.map((t: { tag: { id: string; name: string; color: string } }) => (
                <TagBadge key={t.tag.id} tag={t.tag} size="sm" />
              ))}
            </Group>
          )}

          {/* Body */}
          <TicketBodyEditor
            ticketId={ticketId}
            initialContent={ticket.body ?? null}
          />

          {/* Linked Actions */}
          <LinkedActionsSection
            ticketId={ticketId}
            actions={ticket.actions ?? []}
            workspaceId={workspaceId}
            onChanged={async () => { await utils.product.ticket.getById.invalidate({ id: ticketId }); }}
          />

          {/* Activity / Comments */}
          <div className="mt-4">
            <button
              className="flex items-center gap-1.5 mb-3"
              onClick={() => setActivityCollapsed((v) => !v)}
            >
              {activityCollapsed
                ? <IconChevronRight size={13} className="text-text-muted" />
                : <IconChevronDown size={13} className="text-text-muted" />}
              <Text size="xs" fw={600} className="text-text-muted uppercase tracking-wider">
                Activity
              </Text>
            </button>

            {!activityCollapsed && ticket.comments.length > 0 && (
              <Stack gap="sm" mb="md">
                {ticket.comments.map((c) => (
                  <div key={c.id} className="border border-border-primary rounded-lg p-3">
                    <Group justify="space-between" align="flex-start">
                      <div className="flex-1">
                        <Group gap="xs" mb={4}>
                          <Avatar size="xs" radius="xl" src={c.author.image}>
                            {(c.author.name ?? "?")[0]?.toUpperCase()}
                          </Avatar>
                          <Text size="xs" fw={500} className="text-text-secondary">
                            {c.author.name}
                          </Text>
                          <Text size="xs" className="text-text-muted">
                            {new Date(c.createdAt).toLocaleDateString()}
                          </Text>
                        </Group>
                        <div className="ml-6">
                          <MarkdownRenderer content={c.content} />
                        </div>
                      </div>
                      <ActionIcon variant="subtle" color="red" size="xs" onClick={() => deleteComment.mutate({ id: c.id })}>
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Group>
                  </div>
                ))}
              </Stack>
            )}

            {!activityCollapsed && (
              <div className="flex gap-3">
                <Textarea
                  placeholder="Leave a comment..."
                  value={comment}
                  onChange={(e) => setComment(e.currentTarget.value)}
                  autosize
                  minRows={1}
                  maxRows={4}
                  className="flex-1"
                  styles={{
                    input: {
                      backgroundColor: "transparent",
                      border: "1px solid var(--color-border-primary)",
                      fontSize: "0.85rem",
                    },
                  }}
                />
                <Button
                  size="xs"
                  onClick={() => addComment.mutate({ ticketId, content: comment })}
                  loading={addComment.isPending}
                  disabled={!comment.trim()}
                  className="self-end"
                >
                  Post
                </Button>
              </div>
            )}
          </div>
        </Stack>
      </div>

      {/* Properties sidebar */}
      <PropertiesSidebar>
        {/* Status */}
        <PropertyRow icon={<IconCircleDot size={14} />} label="Status">
          <Select
            value={status}
            onChange={onStatusChange}
            data={STATUS_OPTIONS}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        {/* Priority */}
        <PropertyRow icon={<IconFlag size={14} />} label="Priority">
          <Select
            value={ticket.priority != null ? String(ticket.priority) : undefined}
            onChange={(val) => handleFieldUpdate("priority", val != null ? Number(val) : null)}
            data={PRIORITY_OPTIONS}
            size="xs"
            variant="unstyled"
            clearable
            placeholder="None"
            comboboxProps={{ withinPortal: true }}
            renderOption={({ option }) => <PrioritySelectOption option={option} />}
            leftSection={<PriorityIcon priority={ticket.priority} size={14} />}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24, paddingLeft: 24 } }}
          />
        </PropertyRow>

        {/* Type */}
        <PropertyRow icon={<IconCategory size={14} />} label="Type">
          <Select
            value={ticket.type}
            onChange={(val) => val && handleFieldUpdate("type", val)}
            data={TYPE_OPTIONS}
            size="xs"
            variant="unstyled"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        {/* Assignee */}
        <PropertyRow icon={<IconUser size={14} />} label="Assignee">
          <Select
            value={ticket.assigneeId ?? null}
            onChange={(val) => handleFieldUpdate("assigneeId", val)}
            data={members.map((m) => ({ value: m.user.id, label: m.user.name ?? m.user.email ?? "Unknown" }))}
            size="xs"
            variant="unstyled"
            clearable
            placeholder="None"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        {/* Points */}
        <PropertyRow icon={<IconFlame size={14} />} label="Effort">
          <NumberInput
            value={ticket.points ?? ""}
            onChange={(val) => handleFieldUpdate("points", val === "" ? null : Number(val))}
            size="xs"
            variant="unstyled"
            placeholder="None"
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24, width: 80 } }}
          />
        </PropertyRow>

        <PropertyDivider />

        {/* Dependencies */}
        <TicketDependenciesSection
          ticketId={ticketId}
          productId={ticket.product.id}
          basePath={`/w/${workspace?.slug}/products/${ticket.product.slug}/tickets`}
          dependsOn={ticket.dependsOn ?? []}
          requiredFor={ticket.requiredFor ?? []}
        />

        <PropertyDivider />

        {/* Feature */}
        <PropertyRow icon={<IconFolder size={14} />} label="Feature">
          <Select
            value={ticket.featureId ?? null}
            onChange={(val) => handleFieldUpdate("featureId", val)}
            data={(features ?? []).map((f) => ({ value: f.id, label: f.name }))}
            size="xs"
            variant="unstyled"
            clearable
            placeholder="None"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        {/* Epic */}
        <PropertyRow icon={<IconFlag size={14} />} label="Epic">
          <EpicCombobox
            value={ticket.epicId ?? null}
            epics={epics ?? []}
            onChange={(val) => handleFieldUpdate("epicId", val)}
            onCreate={(name) => {
              if (workspaceId) createEpic.mutate({ workspaceId, name });
            }}
          />
        </PropertyRow>

        {/* Cycle */}
        <PropertyRow icon={<IconClock size={14} />} label="Cycle">
          <Select
            value={ticket.cycleId ?? null}
            onChange={(val) => handleFieldUpdate("cycleId", val)}
            data={(cycles ?? []).map((c) => ({ value: c.id, label: c.name }))}
            size="xs"
            variant="unstyled"
            clearable
            placeholder="None"
            comboboxProps={{ withinPortal: true }}
            classNames={{ input: "text-text-primary text-xs font-medium cursor-pointer" }}
            styles={{ input: { height: 24, minHeight: 24 } }}
          />
        </PropertyRow>

        {/* Tags / Labels */}
        <PropertyRow icon={<IconTag size={14} />} label="Labels">
          <LabelsCombobox
            selectedIds={ticket.tags?.map((t: { tag: { id: string } }) => t.tag.id) ?? []}
            allTags={tags?.allTags ?? []}
            entityTags={ticket.tags ?? []}
            onChange={(tagIds) => setTicketTags.mutate({ ticketId, tagIds })}
            onCreate={(name) => {
              if (workspaceId) createTag.mutate({ name, color: "avatar-blue", workspaceId });
            }}
          />
        </PropertyRow>

        {/* Links */}
        {(ticket.branchName ?? ticket.prUrl ?? ticket.designUrl ?? ticket.specUrl) && (
          <>
            <PropertyDivider />
            {ticket.branchName && (
              <PropertyRow icon={<IconGitBranch size={14} />} label="Branch">
                <Text size="xs" className="text-text-primary font-mono truncate">{ticket.branchName}</Text>
              </PropertyRow>
            )}
            {ticket.prUrl && (
              <PropertyRow icon={<IconLink size={14} />} label="PR">
                <Anchor href={ticket.prUrl} target="_blank" size="xs" className="truncate block">{ticket.prUrl}</Anchor>
              </PropertyRow>
            )}
            {ticket.designUrl && (
              <PropertyRow icon={<IconLink size={14} />} label="Design">
                <Anchor href={ticket.designUrl} target="_blank" size="xs" className="truncate block">{ticket.designUrl}</Anchor>
              </PropertyRow>
            )}
            {ticket.specUrl && (
              <PropertyRow icon={<IconLink size={14} />} label="Spec">
                <Anchor href={ticket.specUrl} target="_blank" size="xs" className="truncate block">{ticket.specUrl}</Anchor>
              </PropertyRow>
            )}
          </>
        )}

        <PropertyDivider />

        {/* Metadata */}
        <PropertyRow icon={<IconUser size={14} />} label="Created by">
          <Group gap="xs">
            <Avatar src={ticket.createdBy?.image} size={18} radius="xl">
              {(ticket.createdBy?.name ?? "?")[0]?.toUpperCase()}
            </Avatar>
            <Text size="xs" className="text-text-muted">
              {ticket.createdBy?.name ?? "Unknown"}
            </Text>
          </Group>
        </PropertyRow>

        <PropertyRow icon={<IconCalendar size={14} />} label="Created">
          <Text size="xs" className="text-text-muted">
            {new Date(ticket.createdAt).toLocaleDateString()}
          </Text>
        </PropertyRow>

        {ticket.completedAt && (
          <PropertyRow icon={<IconCalendar size={14} />} label="Completed">
            <Text size="xs" className="text-text-muted">
              {new Date(ticket.completedAt).toLocaleDateString()}
            </Text>
          </PropertyRow>
        )}
      </PropertiesSidebar>
    </div>
  );
}
