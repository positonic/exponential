"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { ActivityFeed } from "~/app/_components/shared/ActivityFeed";
import { ActivityComposer } from "~/app/_components/shared/ActivityComposer";
import { useWorkspaceMentionCandidates } from "~/hooks/useWorkspaceMentionCandidates";
import type {
  UseActivityReturn,
  ActivityFilter,
} from "~/app/_components/shared/activityTypes";

/**
 * THE entity activity block: unified timeline (comments + audit events) plus
 * the composer. One component for every entity surface - pages call their
 * entity's `useXActivity` hook and hand the result here, so ticket, feature,
 * scope, and knowledge-page timelines are literally the same code path.
 *
 * @mention candidates default to the canonical workspace list (members +
 * linked-team members + agents); a hook may override with a richer set.
 */
export function ActivityTimeline({
  activity,
  filter,
}: {
  activity: UseActivityReturn;
  filter?: ActivityFilter;
}) {
  const { data: session } = useSession();
  const workspaceCandidates = useWorkspaceMentionCandidates();
  const mentionCandidates = activity.mentionCandidates ?? workspaceCandidates;
  const mentionNames = useMemo(
    () => activity.mentionNames ?? mentionCandidates.map((c) => c.name),
    [activity.mentionNames, mentionCandidates],
  );

  return (
    <div>
      <ActivityFeed
        items={activity.items}
        filter={filter}
        currentUserId={session?.user?.id}
        onDeleteComment={activity.deleteComment}
        onEditComment={activity.editComment}
        mentionNames={mentionNames}
        mentionCandidates={mentionCandidates}
        emptyMessage="No comments yet. Start the discussion!"
      />
      <ActivityComposer
        onAddComment={activity.addComment}
        commentPlaceholder="Leave a comment... Use @ to mention"
        mentionCandidates={mentionCandidates}
      />
    </div>
  );
}
