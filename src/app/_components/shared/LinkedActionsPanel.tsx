"use client";

import { useState } from "react";
import {
  ActionIcon,
  Avatar,
  Checkbox,
  Combobox,
  Text,
  TextInput,
  UnstyledButton,
  useCombobox,
} from "@mantine/core";
import { IconPlus, IconX } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { api } from "~/trpc/react";
import { CreateActionModal } from "~/app/_components/CreateActionModal";
import { EditActionModal, type Action } from "~/app/_components/EditActionModal";

/**
 * The Actions block — linked action rows plus one "Link or create an
 * action…" combobox. Started on the ticket detail page; the Decision Log
 * uses the same block, so the rows and the picker live here and each
 * surface supplies its own link/unlink calls.
 *
 * The panel owns nothing but the picker: rows come in as `actions` and
 * every write that is not an action's own edit goes back out through
 * `onLink` / `onUnlink`. The header (a collapsible section, a modal label)
 * belongs to the caller.
 */
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

export function isActionDone(action: LinkedAction): boolean {
  return action.kanbanStatus === "DONE" || action.status === "COMPLETED";
}

function ActionRow({
  action,
  isDone,
  onToggle,
  onUnlink,
  onOpen,
  unlinkPending,
  canEdit,
  withDivider = false,
}: {
  action: LinkedAction;
  isDone: boolean;
  onToggle: (action: LinkedAction, checked: boolean) => void;
  onUnlink: (id: string) => void;
  onOpen: (action: LinkedAction) => void;
  unlinkPending: boolean;
  canEdit: boolean;
  withDivider?: boolean;
}) {
  return (
    // A divider row inside the section's shared bordered container (the
    // container-list grammar, see DESIGN.md) - not a per-row card.
    <div
      className={`flex items-center gap-2 px-3 py-2 group cursor-pointer hover:bg-surface-hover transition-colors ${withDivider ? "border-b border-border-primary" : ""}`}
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
      {canEdit && (
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
      )}
    </div>
  );
}

export function LinkedActionsPanel({
  actions,
  workspaceId,
  onLink,
  onUnlink,
  onChanged,
  unlinkPending = false,
  canEdit = true,
  viewName,
  createProjectId,
}: {
  actions: LinkedAction[];
  workspaceId: string | null;
  /** Link an existing (or just-created) action to whatever owns this block. */
  onLink: (actionId: string) => void;
  onUnlink: (actionId: string) => void;
  /** An action row changed on the server — refetch the rows. */
  onChanged: () => void;
  unlinkPending?: boolean;
  /** Read-only surfaces keep the rows and drop the picker and unlink. */
  canEdit?: boolean;
  /** Provenance label for actions created from the picker. */
  viewName: string;
  /** Project a created action lands in, when the surface has one. */
  createProjectId?: string;
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

  const updateActionStatus = api.action.update.useMutation({ onSuccess: onChanged });

  const linkedIds = new Set(actions.map((a) => a.id));
  const suggestions = (searchResults ?? []).filter((r) => !linkedIds.has(r.id));
  const trimmed = search.trim();
  const hasExactMatch = suggestions.some(
    (r) => r.name.toLowerCase() === trimmed.toLowerCase(),
  );

  const activeActions = actions.filter((a) => !isActionDone(a));
  const doneActions = actions.filter((a) => isActionDone(a));

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
      onLink(value);
      setSearch("");
      combobox.closeDropdown();
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Active action rows - one bordered container, divider rows */}
      {activeActions.length > 0 && (
        <div className="border border-border-primary rounded-lg overflow-hidden">
          {activeActions.map((action, i) => (
            <ActionRow
              key={action.id}
              action={action}
              isDone={false}
              onToggle={handleToggle}
              onOpen={setEditingAction}
              onUnlink={onUnlink}
              unlinkPending={unlinkPending}
              canEdit={canEdit}
              withDivider={i < activeActions.length - 1}
            />
          ))}
        </div>
      )}

      {/* Completed actions */}
      {doneActions.length > 0 && (
        <div>
          {/* Same group-label token as the Dependencies sub-groups
              (margins via props: utility margins are dead on Mantine
              Text - its margin reset wins the cascade). */}
          <Text fz={11} fw={600} mb={6} className="text-text-muted uppercase tracking-wider">
            Completed
          </Text>
          <div className="border border-border-primary rounded-lg overflow-hidden">
            {doneActions.map((action, i) => (
              <ActionRow
                key={action.id}
                action={action}
                isDone={true}
                onToggle={handleToggle}
                onOpen={setEditingAction}
                onUnlink={onUnlink}
                unlinkPending={unlinkPending}
                canEdit={canEdit}
                withDivider={i < doneActions.length - 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Notion-style combobox - always visible */}
      {canEdit && (
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
      )}

      {/* Create action modal - opened when user picks "Create xyz" */}
      <CreateActionModal
        viewName={viewName}
        projectId={createProjectId}
        initialName={pendingName}
        externalOpened={createModalOpen}
        onExternalClose={closeCreateModal}
        onActionCreated={(actionId) => { onLink(actionId); setPendingName(""); }}
      />

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
