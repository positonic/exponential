"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { ActivityFeed } from "~/app/_components/shared/ActivityFeed";
import { ActivityComposer } from "~/app/_components/shared/ActivityComposer";
import type {
  UseActivityReturn,
  ActivityFilter,
} from "~/app/_components/shared/activityTypes";
import type { MentionCandidate } from "~/hooks/useMentionAutocomplete";

/** Workspace members as @mention candidates - the standard set for entity
 *  timelines. (Action detail additionally mixes in linked teams and agents;
 *  that surface builds its own richer list.) */
export function useWorkspaceMentions(): {
  mentionCandidates: MentionCandidate[];
  mentionNames: string[];
} {
  const { workspace } = useWorkspace();
  const mentionCandidates: MentionCandidate[] = useMemo(
    () =>
      (workspace?.members ?? []).map(
        (m: { user: { id: string; name: string | null; email: string | null; image: string | null } }) => ({
          id: m.user.id,
          name: m.user.name ?? m.user.email ?? "Unknown",
          type: "member" as const,
          image: m.user.image,
        }),
      ),
    [workspace?.members],
  );
  const mentionNames = useMemo(
    () => mentionCandidates.map((c) => c.name),
    [mentionCandidates],
  );
  return { mentionCandidates, mentionNames };
}

/**
 * THE entity activity block: unified timeline (comments + audit events) plus
 * the composer. One component for every entity surface - pages call their
 * entity's `useXActivity` hook and hand the result here, so ticket, feature,
 * and scope timelines are literally the same code path.
 */
export function ActivityTimeline({
  activity,
  filter,
}: {
  activity: UseActivityReturn;
  filter?: ActivityFilter;
}) {
  const { data: session } = useSession();
  const { mentionCandidates, mentionNames } = useWorkspaceMentions();

  return (
    <div>
      <ActivityFeed
        items={activity.items}
        filter={filter}
        currentUserId={session?.user?.id}
        onDeleteComment={activity.deleteComment}
        onEditComment={activity.editComment}
        mentionNames={mentionNames}
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
