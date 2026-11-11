"use client";

import { useMemo } from "react";
import { useSession } from "next-auth/react";
import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { ActivityFeed } from "~/app/_components/shared/ActivityFeed";
import {
  ActivityFilterMenu,
  useActivityFilter,
} from "~/app/_components/shared/ActivityFilterMenu";
import { InlineCommentComposer } from "~/app/_components/shared/InlineCommentComposer";
import { useWorkspaceMentionCandidates } from "~/hooks/useWorkspaceMentionCandidates";
import { usePageActivity } from "~/hooks/usePageActivity";

/**
 * Discussion under a Knowledge Page body — the app-wide activity feed
 * ({@link ActivityFeed}) over the pageComment router, the same code path
 * tickets, features and scopes use. View access is the commenting gate
 * (server-enforced), so the composer shows for everyone who can open the page.
 *
 * Unlike the ticket surfaces this sits under prose, so it stays quiet: no
 * rule above it, and the composer is the one-line {@link InlineCommentComposer}
 * that opens into the full Markdown editor on click.
 */
export function PageCommentsSection({ pageId }: { pageId: string }) {
  const activity = usePageActivity(pageId);
  const [activityFilter, setActivityFilter] = useActivityFilter();
  const { data: session } = useSession();
  const workspaceCandidates = useWorkspaceMentionCandidates();
  const mentionCandidates = activity.mentionCandidates ?? workspaceCandidates;
  const mentionNames = useMemo(
    () => activity.mentionNames ?? mentionCandidates.map((c) => c.name),
    [activity.mentionNames, mentionCandidates],
  );

  return (
    <div className="mt-16">
      <CollapsibleSection
        title="Activity"
        action={<ActivityFilterMenu value={activityFilter} onChange={setActivityFilter} />}
      >
        <ActivityFeed
          items={activity.items}
          filter={activityFilter}
          currentUserId={session?.user?.id}
          onDeleteComment={activity.deleteComment}
          onEditComment={activity.editComment}
          mentionNames={mentionNames}
          mentionCandidates={mentionCandidates}
          emptyMessage="No comments yet. Start the discussion!"
        />
        <InlineCommentComposer
          onSubmit={activity.addComment}
          mentionCandidates={mentionCandidates}
          author={session?.user}
        />
      </CollapsibleSection>
    </div>
  );
}
