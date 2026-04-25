"use client";

import { useState } from "react";
import { TextInput, Textarea, Button, Group } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { api } from "~/trpc/react";

interface ContentDraftEditorProps {
  draftId: string;
  initialTitle: string;
  initialContent: string;
  platform: string;
  onClose: () => void;
  workspaceId?: string;
}

export function ContentDraftEditor({
  draftId,
  initialTitle,
  initialContent,
  onClose,
}: ContentDraftEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);

  const utils = api.useUtils();

  const updateMutation = api.content.updateDraft.useMutation({
    onSuccess: () => {
      notifications.show({
        title: "Draft saved",
        message: "Your changes have been saved.",
        color: "green",
      });
      void utils.content.listDrafts.invalidate();
      onClose();
    },
    onError: (error) => {
      notifications.show({
        title: "Save failed",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      id: draftId,
      title,
      content,
    });
  };

  return (
    <div className="mt-2">
      <TextInput
        label="Title"
        value={title}
        onChange={(e) => setTitle(e.currentTarget.value)}
        mb="sm"
      />
      <Textarea
        label="Content"
        value={content}
        onChange={(e) => setContent(e.currentTarget.value)}
        minRows={12}
        maxRows={30}
        autosize
        mb="sm"
        styles={{
          input: {
            fontFamily: "monospace",
            fontSize: "0.875rem",
          },
        }}
      />
      <Group>
        <Button
          size="xs"
          onClick={handleSave}
          loading={updateMutation.isPending}
        >
          Save
        </Button>
        <Button size="xs" variant="default" onClick={onClose}>
          Cancel
        </Button>
      </Group>
    </div>
  );
}
