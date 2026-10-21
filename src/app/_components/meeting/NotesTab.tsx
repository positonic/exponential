"use client";

import { useState } from "react";
import { Button, Loader } from "@mantine/core";
import { IconNotes, IconPencil, IconPlus } from "@tabler/icons-react";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";

interface NotesTabProps {
  /** The stored notes; null or empty when none have been written. */
  notes: string | null;
  isLoading: boolean;
  isError: boolean;
  /** Editors get Edit / Add notes; everyone else reads. The server re-checks. */
  canEdit: boolean;
  onSave: (value: string) => Promise<void>;
}

/**
 * The meeting's human-written notes (`TranscriptionSession.notes`): what the
 * Add Meeting modal's "Notes" field captures, editable here too so a meeting
 * that arrived through an integration or a meeting server can still carry
 * the notes its attendees took. Markdown in, Markdown out (ADR-0017).
 */
export function NotesTab({ notes, isLoading, isError, canEdit, onSave }: NotesTabProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const hasNotes = Boolean(notes?.trim());

  async function save() {
    if (draft === null) return;
    setIsSaving(true);
    try {
      await onSave(draft);
      setDraft(null);
    } catch {
      // onSave surfaces its own error notification; stay in edit mode.
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="mp-empty">
        <Loader size="sm" />
      </div>
    );
  }

  if (isError) {
    return <div className="mp-empty">Couldn&apos;t load the notes.</div>;
  }

  return (
    <section className="mp-tldr">
      <div className="mp-tldr__head">
        <IconNotes size={12} /> Notes
        <span className="mp-spacer" />
      </div>

      {draft !== null ? (
        <>
          <MarkdownInput
            value={draft}
            onChange={(value) => setDraft(value)}
            placeholder="Add meeting notes…"
            minRows={8}
            maxRows={30}
          />
          <div className="mp-tldr__foot">
            <Button size="xs" loading={isSaving} onClick={() => void save()}>
              Save
            </Button>
            <Button size="xs" variant="subtle" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          {hasNotes ? (
            <div className="mp-tldr__text">
              <MarkdownRenderer content={notes ?? ""} variant="compact" />
            </div>
          ) : (
            <p className="mp-tldr__text">No notes yet for this meeting.</p>
          )}
          {canEdit && (
            <div className="mp-tldr__foot">
              <button className="mp-chipbtn" type="button" onClick={() => setDraft(notes ?? "")}>
                {hasNotes ? (
                  <>
                    <IconPencil size={11} /> Edit
                  </>
                ) : (
                  <>
                    <IconPlus size={11} /> Add notes
                  </>
                )}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
