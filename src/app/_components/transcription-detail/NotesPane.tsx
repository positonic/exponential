"use client";

import { Textarea } from "@mantine/core";
import { IconCheck, IconNotes, IconPencil, IconX } from "@tabler/icons-react";

interface NotesPaneProps {
  notes: string | null;
  editing: boolean;
  editedValue: string;
  onEditedValueChange: (v: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  isSaving: boolean;
}

export function NotesPane({
  notes,
  editing,
  editedValue,
  onEditedValueChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  isSaving,
}: NotesPaneProps) {
  const hasNotes = typeof notes === "string" && notes.trim().length > 0;

  if (editing) {
    return (
      <div className="mdm-pane">
        <div className="mdm-transcript">
          <Textarea
            autosize
            minRows={10}
            maxRows={30}
            value={editedValue}
            onChange={(e) => onEditedValueChange(e.currentTarget.value)}
            placeholder="Add meeting notes…"
          />
          <div className="flex gap-2 justify-end mt-3">
            <button
              className="mdm-rail__quick-btn"
              style={{ width: "auto", padding: "6px 12px" }}
              onClick={onCancelEdit}
              disabled={isSaving}
            >
              <IconX size={13} /> Cancel
            </button>
            <button
              className="mdm-rail__quick-btn"
              style={{
                width: "auto",
                padding: "6px 12px",
                color: "var(--color-text-primary)",
                borderColor: "var(--brand-500)",
                background: "var(--brand-500)",
              }}
              onClick={onSave}
              disabled={isSaving}
            >
              <IconCheck size={13} /> Save
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mdm-pane">
      <div className="mdm-summary">
        <div className="mdm-tldr">
          <div
            className="mdm-tldr__head"
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <IconNotes size={12} />
              Notes
            </span>
            <button
              className="mdm-rail__quick-btn"
              style={{ width: "auto", padding: "4px 10px" }}
              onClick={onStartEdit}
              type="button"
            >
              <IconPencil size={12} /> {hasNotes ? "Edit" : "Add notes"}
            </button>
          </div>
          {hasNotes ? (
            <p className="mdm-tldr__text" style={{ whiteSpace: "pre-wrap" }}>
              {notes}
            </p>
          ) : (
            <p
              className="mdm-tldr__text"
              style={{ color: "var(--color-text-muted)" }}
            >
              No notes yet for this meeting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
