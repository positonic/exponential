"use client";

import { useState } from "react";
import {
  SegmentedControl,
  Badge,
  Textarea,
  Button,
  Group,
  Menu,
  ActionIcon,
} from "@mantine/core";
import { IconPaperclip } from "@tabler/icons-react";
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

  const currentHealth = healthConfig[selectedHealth];
  const CurrentHealthIcon = currentHealth.icon;

  return (
    <div className="rounded-lg border border-border-primary">
      {/* Top bar: Comment/Update toggle + health dropdown */}
      <div className="border-b border-border-primary px-4 py-3">
        <Group gap="sm">
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
            <Menu shadow="md" width={180}>
              <Menu.Target>
                <Badge
                  variant="outline"
                  color={currentHealth.mantineColor}
                  leftSection={<CurrentHealthIcon size={14} />}
                  className="cursor-pointer"
                  size="lg"
                >
                  {currentHealth.label}
                </Badge>
              </Menu.Target>
              <Menu.Dropdown>
                {healthOptions.map((h) => {
                  const config = healthConfig[h];
                  const HealthIcon = config.icon;
                  return (
                    <Menu.Item
                      key={h}
                      leftSection={<HealthIcon size={16} style={{ color: config.color }} />}
                      onClick={() => setSelectedHealth(h)}
                    >
                      {config.label}
                    </Menu.Item>
                  );
                })}
              </Menu.Dropdown>
            </Menu>
          )}
        </Group>
      </div>

      {/* Content area */}
      <div className="px-4 pt-3 pb-2">
        {mode === "comment" ? (
          <CommentInput
            onSubmit={handleAddComment}
            isSubmitting={addCommentMutation.isPending}
            placeholder="Leave a comment..."
          />
        ) : (
          <>
            <Textarea
              value={updateContent}
              onChange={(e) => setUpdateContent(e.currentTarget.value)}
              placeholder="Write an initiative update..."
              minRows={4}
              maxRows={8}
              autosize
              variant="unstyled"
              disabled={addUpdateMutation.isPending}
              styles={{
                input: {
                  color: "var(--text-primary)",
                  padding: 0,
                },
              }}
            />

            {/* Bottom bar: attachment + actions */}
            <div className="border-t border-border-primary pt-3 mt-2">
              <Group justify="flex-end" gap="sm">
                <ActionIcon variant="subtle" color="gray" size="md" className="mr-auto">
                  <IconPaperclip size={18} />
                </ActionIcon>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}