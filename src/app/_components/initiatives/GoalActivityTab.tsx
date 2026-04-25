"use client";

import { Badge, Stack, Text } from "@mantine/core";
import { useSession } from "next-auth/react";
import { useGoalActivity } from "~/hooks/useGoalActivity";
import { ActivityComposer } from "~/app/_components/shared/ActivityComposer";
import { ActivityFeed } from "~/app/_components/shared/ActivityFeed";

interface GoalActivityTabProps {
  goalId: number;
  workspaceSlug: string;
}

export function GoalActivityTab({ goalId }: GoalActivityTabProps) {
  const { data: session } = useSession();
  const activity = useGoalActivity(goalId);

  return (
    <Stack gap="lg">
      {activity.count > 0 && (
        <div>
          <Badge variant="light" color="gray" size="lg" radius="sm">
            <Text span size="xs">
              Open updates and activity{" "}
              <Text span fw={700}>
                {activity.count}
              </Text>
            </Text>
          </Badge>
        </div>
      )}

      <ActivityComposer
        onAddComment={activity.addComment}
        onAddUpdate={activity.addUpdate}
        statusOptions={activity.statusOptions}
        defaultStatus={activity.defaultStatus}
        updatePlaceholder="Write an initiative update..."
      />

      {activity.isLoading ? (
        <Text size="sm" c="dimmed">
          Loading activity...
        </Text>
      ) : (
        <ActivityFeed
          items={activity.items}
          currentUserId={session?.user?.id}
          onDeleteComment={activity.deleteComment}
          onEditComment={activity.editComment}
          onDeleteUpdate={activity.deleteUpdate}
          onAddReply={activity.addReply}
          onDeleteReply={activity.deleteReply}
          onEditReply={activity.editReply}
          statusOptions={activity.statusOptions}
        />
      )}
    </Stack>
  );
}
