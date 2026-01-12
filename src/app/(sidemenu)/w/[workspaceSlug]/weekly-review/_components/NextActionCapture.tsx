"use client";

import { useState } from "react";
import { TextInput, Button, Group, Text, Stack } from "@mantine/core";
import { IconPlus, IconCheck } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface NextActionCaptureProps {
  projectId: string;
  workspaceId: string | null;
  onActionAdded: () => void;
}

export function NextActionCapture({
  projectId,
  workspaceId,
  onActionAdded,
}: NextActionCaptureProps) {
  const [actionTitle, setActionTitle] = useState("");
  const [isAdded, setIsAdded] = useState(false);

  const utils = api.useUtils();

  const createAction = api.action.create.useMutation({
    onSuccess: () => {
      setIsAdded(true);
      setActionTitle("");
      onActionAdded();
      void utils.project.getActiveWithDetails.invalidate();
      notifications.show({
        title: "Action added",
        message: "Next action has been created",
        color: "green",
      });
    },
    onError: (error) => {
      notifications.show({
        title: "Error",
        message: error.message,
        color: "red",
      });
    },
  });

  const handleSubmit = () => {
    if (!actionTitle.trim()) return;

    createAction.mutate({
      name: actionTitle.trim(),
      projectId,
      workspaceId: workspaceId ?? undefined,
      status: "ACTIVE",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500} className="text-text-secondary">
        Next Action
      </Text>

      {isAdded ? (
        <Group gap="xs" className="rounded-md bg-green-500/10 p-3">
          <IconCheck size={16} className="text-green-500" />
          <Text size="sm" className="text-green-500">
            Action added
          </Text>
          <Button
            variant="subtle"
            size="xs"
            onClick={() => setIsAdded(false)}
          >
            Add another
          </Button>
        </Group>
      ) : (
        <Group gap="sm">
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
            disabled={!actionTitle.trim()}
          >
            Add
          </Button>
        </Group>
      )}
    </Stack>
  );
}
