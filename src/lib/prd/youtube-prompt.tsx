"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/core";
import { Button, Group, Stack, TextInput } from "@mantine/core";
import { modals } from "@mantine/modals";

import { parseYouTubeUrl } from "./youtube";

const MODAL_ID = "youtube-embed-prompt";

function YouTubeUrlForm({ editor }: { editor: Editor }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const video = parseYouTubeUrl(value);
    if (!video) {
      setError("Paste a link to a single YouTube video.");
      return;
    }
    modals.close(MODAL_ID);
    if (editor.isDestroyed) return;
    editor.chain().focus().setYouTubeVideo(video).run();
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Stack gap="sm">
        <TextInput
          data-autofocus
          label="YouTube link"
          placeholder="https://www.youtube.com/watch?v=…"
          value={value}
          error={error}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setError(null);
          }}
        />
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={() => modals.close(MODAL_ID)}>
            Cancel
          </Button>
          <Button type="submit" disabled={value.trim() === ""}>
            Embed
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

/**
 * Ask for a YouTube link and embed it at the editor's selection. The slash
 * command deletes its `/youtube` query first, so the selection is where the
 * command was typed.
 */
export function openYouTubePrompt(editor: Editor): void {
  modals.open({
    modalId: MODAL_ID,
    title: "Embed a YouTube video",
    children: <YouTubeUrlForm editor={editor} />,
    onClose: () => {
      if (!editor.isDestroyed) editor.commands.focus();
    },
  });
}
