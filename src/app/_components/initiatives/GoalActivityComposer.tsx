"use client";

import { useState } from "react";
import {
  SegmentedControl,
  Badge,
  Textarea,
  Button,
  Group,
  Stack,
} from "@mantine/core";
import { healthConfig } from "./healthConfig";
import { CommentInput } from "~/plugins/okr/client/components/CommentInput";
import { api } from "~/trpc/react";

type UpdateHealth = "on-track" | "at-risk" | "off-track";

interface GoalActivityComposerProps {
  goalId: number;
  onSuccess: () => void;
}

const healthOptions: UpdateHealth[] = ["on-track", "at-risk", "off-track"];

export function GoalActivityComposer({ goalId, onSuccess }: GoalActivityComposerProps) {
  const [mode, setMode] = useState<"comment" | "update">("update");
  const [selectedHealth, setSelectedHealth] = useState<UpdateHealth>("on-track");
  const [updateContent, setUpdateContent] = useState("");

  const addCommentMutation = api.goalComment.addComment.useMutation({
    onSuccess: () => {
      onSuccess();
    },
  });

  const addUpdateMutation = api.goalUpdate.addUpdate.useMutation({
    onSuccess: () => {
      setUpdateContent("");
      onSuccess();
    },
  });

  const handleAddComment = async (content: string) => {
    await addCommentMutation.mutateAsync({ goalId, content });
  };

  const handlePostUpdate = () => {
    if (!updateContent.trim()) return;
    addUpdateMutation.mutate({
      goalId,
      content: updateContent.trim(),
      health: selectedHealth,
    });
  };

  return (
    <div className="rounded-lg border border-border-primary p-4">
      <Group gap="xs" mb="md">
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(val) => setMode(val as "comment" | "update")}
          data={[
            { label: "Comment", value: "comment" },
            { label: "Update", value: "update" },
          ]}
        />
        {mode === "update" && (
          <Group gap={6}>
            {healthOptions.map((h) => {
              const config = healthConfig[h];
              const HealthIcon = config.icon;
              const isSelected = selectedHealth === h;
              return (
                <Badge
                  key={h}
                  variant={isSelected ? "filled" : "outline"}
                  color={config.mantineColor}
                  leftSection={<HealthIcon size={12} />}
                  className="cursor-pointer"
                  onClick={() => setSelectedHealth(h)}
                  styles={{
                    root: {
                      opacity: isSelected ? 1 : 0.5,
                    },
                  }}
                >
                  {config.label}
                </Badge>
              );
            })}
          </Group>
        )}
      </Group>

      {mode === "comment" ? (
        <CommentInput
          onSubmit={handleAddComment}
          isSubmitting={addCommentMutation.isPending}
          placeholder="Leave a comment..."
        />
      ) : (
        <Stack gap="sm">
          <Textarea
            value={updateContent}
            onChange={(e) => setUpdateContent(e.currentTarget.value)}
            placeholder="Write an initiative update..."
            minRows={3}
            maxRows={6}
            autosize
            disabled={addUpdateMutation.isPending}
            styles={{
              input: {
                backgroundColor: "var(--surface-secondary)",
                borderColor: "var(--border-primary)",
                color: "var(--text-primary)",
              },
            }}
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="subtle"
              size="xs"
              onClick={() => setUpdateContent("")}
              disabled={addUpdateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="filled"
              size="xs"
              color="brand"
              onClick={handlePostUpdate}
              loading={addUpdateMutation.isPending}
              disabled={!updateContent.trim()}
            >
              Post update
            </Button>
          </Group>
        </Stack>
      )}
    </div>
  );
}
