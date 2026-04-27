import { useState } from "react";
import { Select } from "@mantine/core";
import type { Action } from "~/lib/actions/types";
import type { useBulkSelection } from "../hooks/useBulkSelection";
import {
  ReschedulePopover,
  type RescheduleChoice,
} from "./ReschedulePopover";
import styles from "./BulkEditToolbar.module.css";

export type BulkActionDef =
  | {
      kind: "reschedule";
      onReschedule: (date: Date | null, ids: string[]) => void;
      label?: string;
    }
  | {
      kind: "delete";
      onDelete: (ids: string[]) => void;
      confirmMessage?: (count: number) => string;
      label?: string;
    }
  | {
      kind: "assignProject";
      onAssign: (projectId: string, ids: string[]) => Promise<void> | void;
      label?: string;
    };

interface BulkEditToolbarProps {
  selection: ReturnType<typeof useBulkSelection<Action>>;
  allItems: Action[];
  actions: BulkActionDef[];
  workspaceProjects?: Array<{ id: string; name: string }>;
}

export function BulkEditToolbar({
  selection,
  allItems,
  actions,
  workspaceProjects,
}: BulkEditToolbarProps) {
  const [reschedulePopOpen, setReschedulePopOpen] = useState(false);
  const [assignProjectId, setAssignProjectId] = useState<string | null>(null);

  const disabled = selection.count === 0;
  const ids = () => Array.from(selection.selected);

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.btn}
        onClick={() => selection.selectAll()}
        disabled={allItems.length === 0}
      >
        Select all
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={() => selection.selectNone()}
        disabled={disabled}
      >
        Select none
      </button>
      <span className={styles.count}>{selection.count} selected</span>
      <span className={styles.spacer} />

      {actions.map((entry, idx) => {
        if (entry.kind === "reschedule") {
          return (
            <div key={`reschedule-${idx}`} className={styles.popoverWrap}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={() => setReschedulePopOpen((v) => !v)}
                disabled={disabled}
              >
                {entry.label ?? "Reschedule"}
              </button>
              {reschedulePopOpen && !disabled && (
                <ReschedulePopover
                  onChoose={(choice: RescheduleChoice) => {
                    setReschedulePopOpen(false);
                    entry.onReschedule(choice.date, ids());
                  }}
                />
              )}
            </div>
          );
        }
        if (entry.kind === "delete") {
          return (
            <button
              key={`delete-${idx}`}
              type="button"
              className={`${styles.btn} ${styles.btnDanger}`}
              onClick={() => {
                const count = selection.count;
                const message =
                  entry.confirmMessage?.(count) ??
                  `Delete ${count} action${count === 1 ? "" : "s"}?`;
                if (!window.confirm(message)) return;
                entry.onDelete(ids());
              }}
              disabled={disabled}
            >
              {entry.label ?? "Delete"}
            </button>
          );
        }
        // assignProject
        return (
          <div
            key={`assign-${idx}`}
            style={{ display: "inline-flex", gap: 6, alignItems: "center" }}
          >
            <Select
              size="xs"
              placeholder="Move to project…"
              data={(workspaceProjects ?? []).map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              value={assignProjectId}
              onChange={setAssignProjectId}
              disabled={disabled}
              searchable
              comboboxProps={{ withinPortal: true }}
            />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={() => {
                if (!assignProjectId) return;
                void Promise.resolve(
                  entry.onAssign(assignProjectId, ids()),
                ).then(() => setAssignProjectId(null));
              }}
              disabled={disabled || !assignProjectId}
            >
              {entry.label ?? "Move"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
