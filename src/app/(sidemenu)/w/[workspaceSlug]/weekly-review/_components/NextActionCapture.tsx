"use client";

import { useState } from "react";
import { TextInput, Button, Group, Text, Stack } from "@mantine/core";
import { IconPlus, IconCircle } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { notifications } from "@mantine/notifications";

interface ExistingAction {
  id: string;
  name: string;
  status: string;
}

interface CreatedAction {
  id: string;
  name: string;
}

interface NextActionCaptureProps {
  projectId: string;
  workspaceId: string | null;
  existingActions?: ExistingAction[];
  onActionAdded: (newAction: { id: string; name: string; status: string }) => void;
}

export function NextActionCapture({
  projectId,
  workspaceId,
  existingActions = [],
  onActionAdded,
}: NextActionCaptureProps) {
  const [actionTitle, setActionTitle] = useState("");
  const [createdActions, setCreatedActions] = useState<CreatedAction[]>([]);

  const utils = api.useUtils();

  // Filter existing actions to show only active ones
  const activeExistingActions = existingActions.filter(
    (a) => a.status === "ACTIVE" || a.status === "TODO"
  );

  const createAction = api.action.create.useMutation({
    onSuccess: (data) => {
      setCreatedActions((prev) => [...prev, { id: data.id, name: data.name }]);
      setActionTitle("");
      onActionAdded({ id: data.id, name: data.name, status: "ACTIVE" });
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
      priority: "1st Priority",
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const allActions = [
    ...activeExistingActions.map((a) => ({ ...a, isNew: false })),
    ...createdActions.map((a) => ({ ...a, isNew: true })),
  ];

  return (
    <Stack gap="xs">
      <Text size="sm" fw={500} className="text-text-secondary">
        Next Action
      </Text>

      {/* Display existing and newly created actions */}
      {allActions.length > 0 && (
        <Stack gap={4} className="mb-2">
          {allActions.map((action) => (
            <Group key={action.id} gap="xs" className="text-text-secondary">
              <IconCircle size={8} className="text-text-muted" />
              <Text size="sm" className={action.isNew ? "text-green-500" : ""}>
                {action.name}
                {action.isNew && (
                  <Text component="span" size="xs" className="ml-2 text-green-500/70">
                    (just added)
                  </Text>
                )}
              </Text>
            </Group>
          ))}
        </Stack>
      )}

      {/* Input for adding new action */}
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
    </Stack>
  );
}
