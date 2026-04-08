"use client";

import { Badge, Stack, Text } from "@mantine/core";
import { useSession } from "next-auth/react";
import { api } from "~/trpc/react";
import { GoalActivityComposer } from "./GoalActivityComposer";
import { GoalActivityFeed } from "./GoalActivityFeed";

interface GoalActivityTabProps {
  goalId: number;
  workspaceSlug: string;
}

export function GoalActivityTab({ goalId }: GoalActivityTabProps) {
  const { data: session } = useSession();
  const utils = api.useUtils();

  const { data: feed, isLoading: feedLoading } =
    api.goalActivity.getFeed.useQuery({ goalId });

  const { data: count } = api.goalActivity.getCount.useQuery({ goalId });

  const invalidateAll = () => {
    void utils.goalActivity.getFeed.invalidate({ goalId });
    void utils.goalActivity.getCount.invalidate({ goalId });
    void utils.goal.getById.invalidate({ id: goalId });
  };

  return (
    <Stack gap="lg">
      {count != null && count > 0 && (
        <div>
          <Badge variant="light" color="gray" size="lg" radius="sm">
            <Text span size="xs">
              Open updates and activity{" "}
              <Text span fw={700}>
                {count}
              </Text>
            </Text>
          </Badge>
        </div>
      )}

      <GoalActivityComposer goalId={goalId} onSuccess={invalidateAll} />

      {feedLoading ? (
        <Text size="sm" c="dimmed">
          Loading activity...
        </Text>
      ) : (
        <GoalActivityFeed
          goalId={goalId}
          currentUserId={session?.user?.id}
          items={feed ?? []}
          onMutationSuccess={invalidateAll}
        />
      )}
    </Stack>
  );
}
