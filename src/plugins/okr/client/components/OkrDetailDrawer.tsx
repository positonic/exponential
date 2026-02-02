"use client";

import {
  Drawer,
  Text,
  ScrollArea,
  Stack,
  Progress,
  Badge,
  Divider,
  Group,
  Loader,
} from "@mantine/core";
import { IconTarget, IconChartLine } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { CommentThread } from "./CommentThread";
import { CommentInput } from "./CommentInput";

interface KeyResultCheckIn {
  id: string;
  previousValue: number;
  newValue: number;
  notes: string | null;
  createdAt: Date;
}

interface OkrDetailDrawerProps {
  opened: boolean;
  onClose: () => void;
  type: "objective" | "keyResult";
  itemId: number | string | null;
  title?: string;
  description?: string | null;
  progress?: number;
  status?: string;
  lifeDomainName?: string | null;
}

/**
 * Get the Mantine color for a status.
 */
function getStatusColor(status: string): string {
  switch (status) {
    case "on-track":
      return "green";
    case "achieved":
      return "blue";
    case "at-risk":
      return "yellow";
    case "off-track":
      return "red";
    default:
      return "gray";
  }
}

/**
 * Format status for display.
 */
function formatStatus(status: string): string {
  return status
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Side drawer showing details and discussion for an Objective or Key Result.
 */
export function OkrDetailDrawer({
  opened,
  onClose,
  type,
  itemId,
  title,
  description,
  progress = 0,
  status = "on-track",
  lifeDomainName,
}: OkrDetailDrawerProps) {
  const utils = api.useUtils();

  // Fetch comments based on type
  const goalCommentsQuery = api.okr.getGoalComments.useQuery(
    { goalId: itemId as number },
    { enabled: opened && type === "objective" && itemId !== null }
  );

  const keyResultCommentsQuery = api.okr.getKeyResultComments.useQuery(
    { keyResultId: itemId as string },
    { enabled: opened && type === "keyResult" && itemId !== null }
  );

  // Fetch check-ins for key results
  const keyResultQuery = api.okr.getById.useQuery(
    { id: itemId as string },
    { enabled: opened && type === "keyResult" && itemId !== null }
  );

  const comments =
    type === "objective"
      ? goalCommentsQuery.data ?? []
      : keyResultCommentsQuery.data ?? [];

  const isLoadingComments =
    type === "objective"
      ? goalCommentsQuery.isLoading
      : keyResultCommentsQuery.isLoading;

  const checkIns = (keyResultQuery.data?.checkIns ?? []) as KeyResultCheckIn[];

  // Add comment mutations
  const addGoalComment = api.okr.addGoalComment.useMutation({
    onSuccess: () => {
      void utils.okr.getGoalComments.invalidate({ goalId: itemId as number });
    },
  });

  const addKeyResultComment = api.okr.addKeyResultComment.useMutation({
    onSuccess: () => {
      void utils.okr.getKeyResultComments.invalidate({
        keyResultId: itemId as string,
      });
    },
  });

  // Delete comment mutations
  const deleteGoalComment = api.okr.deleteGoalComment.useMutation({
    onSuccess: () => {
      void utils.okr.getGoalComments.invalidate({ goalId: itemId as number });
    },
  });

  const deleteKeyResultComment = api.okr.deleteKeyResultComment.useMutation({
    onSuccess: () => {
      void utils.okr.getKeyResultComments.invalidate({
        keyResultId: itemId as string,
      });
    },
  });

  const handleAddComment = async (content: string) => {
    if (type === "objective") {
      await addGoalComment.mutateAsync({ goalId: itemId as number, content });
    } else {
      await addKeyResultComment.mutateAsync({
        keyResultId: itemId as string,
        content,
      });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (type === "objective") {
      await deleteGoalComment.mutateAsync({ commentId });
    } else {
      await deleteKeyResultComment.mutateAsync({ commentId });
    }
  };

  const isAddingComment =
    addGoalComment.isPending || addKeyResultComment.isPending;

  const statusColor = getStatusColor(status);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="md"
      title=""
      trapFocus={false}
      lockScroll={false}
      withOverlay={false}
    >
      <ScrollArea h="100%" offsetScrollbars>
        <Stack gap="md" p="md">
          {/* Header */}
          <Group gap="xs" className="pb-2 border-b border-border-primary">
            {type === "objective" ? (
              <IconTarget size={20} className="text-text-muted" />
            ) : (
              <IconChartLine size={20} className="text-text-muted" />
            )}
            <Text fw={600} className="text-text-primary">
              {type === "objective" ? "Objective" : "Key Result"}
            </Text>
          </Group>

          {/* Title and Status */}
          <div>
            <Text fw={600} size="lg" className="text-text-primary mb-2">
              {title}
            </Text>
            <Group gap="xs">
              <Badge color={statusColor} variant="light" size="sm">
                {formatStatus(status)}
              </Badge>
              {lifeDomainName && (
                <Badge color="gray" variant="light" size="sm">
                  {lifeDomainName}
                </Badge>
              )}
            </Group>
          </div>

          {/* Progress Bar */}
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="sm" className="text-text-muted">
                Progress
              </Text>
              <Text size="sm" fw={500} className="text-text-primary">
                {Math.round(progress)}%
              </Text>
            </Group>
            <Progress value={progress} size="md" color={statusColor} radius="xl" />
          </div>

          {/* Description */}
          {description && (
            <div>
              <Text size="sm" fw={500} className="text-text-secondary mb-1">
                Description
              </Text>
              <Text size="sm" className="text-text-muted">
                {description}
              </Text>
            </div>
          )}

          <Divider />

          {/* Discussion Section */}
          <div>
            <Text size="sm" fw={600} className="text-text-primary mb-3">
              Discussion ({comments.length})
            </Text>

            {isLoadingComments ? (
              <div className="flex justify-center py-4">
                <Loader size="sm" />
              </div>
            ) : (
              <CommentThread
                comments={comments}
                onDeleteComment={handleDeleteComment}
              />
            )}

            <CommentInput
              onSubmit={handleAddComment}
              isSubmitting={isAddingComment}
              placeholder="Add a comment..."
            />
          </div>

          {/* Check-ins Section (Key Results only) */}
          {type === "keyResult" && checkIns.length > 0 && (
            <>
              <Divider />
              <div>
                <Text size="sm" fw={600} className="text-text-primary mb-3">
                  Check-in History
                </Text>
                <Stack gap="xs">
                  {checkIns.map((checkIn) => (
                    <div
                      key={checkIn.id}
                      className="p-2 rounded bg-surface-secondary"
                    >
                      <Group justify="space-between">
                        <Text size="sm" className="text-text-primary">
                          {checkIn.previousValue}% → {checkIn.newValue}%
                        </Text>
                        <Text size="xs" className="text-text-muted">
                          {new Date(checkIn.createdAt).toLocaleDateString()}
                        </Text>
                      </Group>
                      {checkIn.notes && (
                        <Text size="xs" className="text-text-muted mt-1">
                          {checkIn.notes}
                        </Text>
                      )}
                    </div>
                  ))}
                </Stack>
              </div>
            </>
          )}
        </Stack>
      </ScrollArea>
    </Drawer>
  );
}
