"use client";

import { api } from "~/trpc/react";
import { RichDocEditor } from "~/app/_components/shared/RichDocEditor";

interface EpicDescriptionEditorProps {
  epicId: string;
  /** The epic's description. Epics store Markdown only — no `bodyDoc`. */
  description: string | null;
}

/**
 * The epic description editor: the shared {@link RichDocEditor} engine, the
 * same surface as the ticket body, wired to the epic's plain Markdown
 * `description`. An epic has no ProseMirror document or `docVersion`, so every
 * save writes the Markdown projection back and there is no stale-write guard —
 * last write wins, as it does for every other epic field.
 *
 * Hosts must key this component by epic (`key={epicId}`): the engine loads its
 * content exactly once per mount.
 */
export function EpicDescriptionEditor({
  epicId,
  description,
}: EpicDescriptionEditorProps) {
  const utils = api.useUtils();
  const updateEpic = api.epic.update.useMutation();

  return (
    <RichDocEditor
      initialDoc={null}
      initialMarkdown={description}
      editable
      placeholder="Add a description..."
      onSave={async ({ markdown }) => {
        const trimmed = markdown.trim();
        const next = trimmed ? markdown : null;
        await updateEpic.mutateAsync({ id: epicId, description: next });
        // The engine loads its content once per mount, from whatever the cache
        // holds — patch it so a remount shows this edit, not the old text.
        utils.epic.getById.setData({ id: epicId }, (old) =>
          old ? { ...old, description: next } : old,
        );
      }}
    />
  );
}
