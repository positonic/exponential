"use client";

import { useState } from "react";
import {
  ActionIcon,
  Avatar,
  Button,
  Checkbox,
  Combobox,
  Group,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  useCombobox,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { api } from "~/trpc/react";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { CreateActionModal } from "~/app/_components/CreateActionModal";
import { EditActionModal, type Action } from "~/app/_components/EditActionModal";

// Extracted from the ticket detail page so the ticket peek drawer renders the
// exact same Actions block. `LinkedAction` is the `ticket.getById` action row.
export interface LinkedAction extends Action {
  kanbanStatus: string | null;
  assignees: Array<{ user: { id: string; name: string | null; email: string | null; image: string | null } }>;
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
      {/* Circular checkbox - a real onChange target so Space/screen readers
          can toggle it (was readOnly with the toggle on a wrapper div). */}
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          size="xs"
          radius="xl"
          checked={isDone}
          onChange={(e) => onToggle(action, e.currentTarget.checked)}
          aria-label={isDone ? "Mark action not done" : "Mark action done"}
          styles={{
            input: {
              borderColor: isDone ? "var(--mantine-color-green-filled)" : getActionPriorityBorderColor(action.priority),
              backgroundColor: isDone ? "var(--mantine-color-green-filled)" : "transparent",
              cursor: "pointer",
            },
          }}
        />
      </div>

      {/* Name - a focusable open affordance, so the edit modal is reachable
          by keyboard (the row div's onClick is mouse convenience only). */}
      <UnstyledButton
        onClick={(e) => { e.stopPropagation(); onOpen(action); }}
        className={`flex-1 min-w-0 truncate text-left text-sm ${isDone ? "line-through opacity-30" : "text-text-primary"}`}
      >
        {action.name}
      </UnstyledButton>

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

      {/* Unlink - focus-visible reveal so the button is never invisible
          while focused. */}
      <ActionIcon
        variant="subtle"
        size="xs"
        className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-text-muted hover:text-brand-error transition-opacity shrink-0"
        onClick={(e) => { e.stopPropagation(); onUnlink(action.id); }}
        loading={unlinkPending}
        aria-label="Unlink action"
      >
        <IconX size={12} />
      </ActionIcon>
    </div>
  );
}

export function LinkedActionsSection({
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
  // Unlink is one unconfirmed click - the undo toast closes the loop
  // (re-linking is idempotent), matching the list's bulk-edit undo pattern.
  const unlinkAction = api.product.ticket.unlinkAction.useMutation({
    onSuccess: (_data, vars) => {
      onChanged();
      const nid = `action-unlinked-${vars.actionId}`;
      notifications.show({
        id: nid,
        message: (
          <Group justify="space-between" gap="sm" wrap="nowrap">
            <Text size="sm">Action unlinked</Text>
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => {
                notifications.hide(nid);
                linkAction.mutate({ ticketId, actionId: vars.actionId });
              }}
            >
              Undo
            </Button>
          </Group>
        ),
      });
    },
  });
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
    <div>
      {/* The shared chevron + uppercase header (one implementation for
          Actions / Dependencies / Activity), count in the meta slot. */}
      <CollapsibleSection
        title="Actions"
        meta={actions.length > 0 ? String(actions.length) : undefined}
      >
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
              {/* Same group-label token as the Dependencies sub-groups
                  (margins via props: utility margins are dead on Mantine
                  Text - its margin reset wins the cascade). */}
              <Text fz={11} fw={600} mb={6} className="text-text-muted uppercase tracking-wider">
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
                          className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.kanbanStatus === "DONE" ? "bg-brand-success" : "bg-border-primary"}`}
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
      </CollapsibleSection>

      {/* Edit action modal - opened when clicking a row */}
      <EditActionModal
        action={editingAction}
        opened={editingAction !== null}
        onClose={() => setEditingAction(null)}
        onSuccess={() => { setEditingAction(null); onChanged(); }}
      />
    </div>
  );
}
