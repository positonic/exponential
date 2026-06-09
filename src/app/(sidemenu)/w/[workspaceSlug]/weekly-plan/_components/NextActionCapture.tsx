"use client";

import { useState } from "react";
import { TextInput, Button, Group } from "@mantine/core";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { notifications } from "@mantine/notifications";
import { type Action } from "~/app/_components/ActionItem";
import { EditActionModal } from "~/app/_components/EditActionModal";

// Full action shape from the project query (now includes tags).
type ExistingAction = RouterOutputs["project"]["getActiveWithDetails"][0]["actions"][0];

interface NextActionCaptureProps {
  projectId: string;
  workspaceId: string | null;
  existingActions?: ExistingAction[];
  onActionAdded: (newAction: { id: string; name: string; status: string }) => void;
  onActionUpdated?: () => void;
}

/** Compact, human-readable due label (Today / Tomorrow / Wed / Jun 30). */
function formatDue(date: Date | string): string {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return target.toLocaleDateString(undefined, { weekday: "short" });
  }
  return target.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

interface ActionRowProps {
  action: ExistingAction;
  done: boolean;
  pending: boolean;
  onToggle: () => void;
  onOpen: () => void;
}

/**
 * A single action row. The completion control is a ROUND to-do check
 * (done = filled green + strike-through) — deliberately distinct from the
 * wide pill toggle used by Key Results.
 */
function ActionRow({ action, done, pending, onToggle, onOpen }: ActionRowProps) {
  const tag = action.tags?.[0]?.tag?.name ?? null;
  const due = action.dueDate ? formatDue(action.dueDate) : null;

  return (
    <div className="flex items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-background-elevated">
      <button
        type="button"
        onClick={onToggle}
        disabled={pending}
        aria-pressed={done}
        aria-label={done ? "Mark not done" : "Mark done"}
        className={
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 " +
          (done
            ? "border-accent-crm bg-accent-crm text-white"
            : "border-border-strong hover:border-brand-400")
        }
      >
        {done && <IconCheck size={12} />}
      </button>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span
          className={
            "truncate text-sm " +
            (done ? "text-text-muted line-through" : "text-text-primary")
          }
        >
          {action.name}
        </span>
        {tag && (
          <span className="shrink-0 rounded bg-brand-400/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-[var(--brand-200)]">
            {tag}
          </span>
        )}
      </button>
      {due && <span className="shrink-0 text-xs text-text-muted">{due}</span>}
    </div>
  );
}

export function NextActionCapture({
  projectId,
  workspaceId,
  existingActions = [],
  onActionAdded,
  onActionUpdated,
}: NextActionCaptureProps) {
  const [actionTitle, setActionTitle] = useState("");
  const [tab, setTab] = useState<"open" | "completed">("open");
  const [selectedAction, setSelectedAction] = useState<ExistingAction | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);

  const utils = api.useUtils();

  const openActions = existingActions.filter(
    (a) =>
      a.status === "ACTIVE" || a.status === "TODO" || a.status === "IN_PROGRESS",
  );

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const completedActions = existingActions.filter(
    (a) =>
      (a.status === "DONE" || a.status === "COMPLETED") &&
      a.completedAt &&
      new Date(a.completedAt) > sevenDaysAgo,
  );

  const updateAction = api.action.update.useMutation({
    onSuccess: () => {
      void utils.project.getActiveWithDetails.invalidate();
      onActionUpdated?.();
    },
    onError: (error) => {
      notifications.show({ title: "Error", message: error.message, color: "red" });
    },
  });

  const createAction = api.action.create.useMutation({
    onSuccess: (data) => {
      setActionTitle("");
      // Parent prepends to its local actions so the new action lands at the
      // top of Open immediately.
      onActionAdded({ id: data.id, name: data.name, status: "ACTIVE" });
      void utils.project.getActiveWithDetails.invalidate();
      notifications.show({
        title: "Action added",
        message: "Next action has been created",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({ title: "Error", message: error.message, color: "red" });
    },
  });

  const handleSubmit = () => {
    if (!actionTitle.trim()) return;
    createAction.mutate({
      name: actionTitle.trim(),
      projectId,
      workspaceId: workspaceId ?? undefined,
      status: "ACTIVE",
      priority: "1st Priority",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleToggle = (action: ExistingAction, done: boolean) => {
    const newStatus = done ? "ACTIVE" : "COMPLETED";
    updateAction.mutate({
      id: action.id,
      status: newStatus,
      ...(action.projectId
        ? { kanbanStatus: done ? ("TODO" as const) : ("DONE" as const) }
        : {}),
    });
  };

  const openEdit = (action: ExistingAction) => {
    setSelectedAction(action);
    setEditModalOpened(true);
  };

  const rows = tab === "open" ? openActions : completedActions;
  const hasTextToAdd = actionTitle.trim().length > 0;

  return (
    <>
      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Actions"
        className="mb-3 inline-flex gap-1 rounded-md border border-border-primary bg-background-primary p-1"
      >
        {(
          [
            { key: "open" as const, label: "Open", count: openActions.length },
            {
              key: "completed" as const,
              label: "Completed",
              count: completedActions.length,
            },
          ]
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={
              "inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 " +
              (tab === t.key
                ? "bg-surface-secondary text-text-primary"
                : "text-text-muted hover:text-text-secondary")
            }
          >
            {t.label}
            <span
              className={
                "font-mono text-[10.5px] " +
                (tab === t.key ? "text-brand-400" : "text-text-faint")
              }
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Rows */}
      <div className="flex flex-col">
        {rows.length === 0 ? (
          <div className="px-1 py-4 text-center text-sm text-text-muted">
            {tab === "open"
              ? "No open actions — add the next step below."
              : "Nothing completed yet."}
          </div>
        ) : (
          rows.map((action) => (
            <ActionRow
              key={action.id}
              action={action}
              done={tab === "completed"}
              pending={updateAction.isPending}
              onToggle={() => handleToggle(action, tab === "completed")}
              onOpen={() => openEdit(action)}
            />
          ))
        )}
      </div>

      {/* Add action */}
      <Group gap="sm" className="mt-3">
        <TextInput
          placeholder="What's the next step for this project?"
          value={actionTitle}
          onChange={(e) => setActionTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
        />
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleSubmit}
          loading={createAction.isPending}
          disabled={!hasTextToAdd}
          variant={hasTextToAdd ? "filled" : "default"}
        >
          Add
        </Button>
      </Group>

      <EditActionModal
        action={selectedAction as unknown as Action}
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setSelectedAction(null);
        }}
        onSuccess={() => {
          void utils.project.getActiveWithDetails.invalidate();
          onActionUpdated?.();
        }}
      />
    </>
  );
}
