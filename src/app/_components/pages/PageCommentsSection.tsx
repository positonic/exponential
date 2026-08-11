"use client";

import { CollapsibleSection } from "~/app/_components/product/CollapsibleSection";
import { ActivityTimeline } from "~/app/_components/shared/ActivityTimeline";
import {
  ActivityFilterMenu,
  useActivityFilter,
} from "~/app/_components/shared/ActivityFilterMenu";
import { usePageActivity } from "~/hooks/usePageActivity";

/**
 * Discussion under a Knowledge Page body — the app-wide activity block
 * ({@link ActivityTimeline}) over the pageComment router, the same code path
 * tickets, features and scopes use. View access is the commenting gate
 * (server-enforced), so the composer shows for everyone who can open the page.
 */
export function PageCommentsSection({ pageId }: { pageId: string }) {
  const activity = usePageActivity(pageId);
  const [activityFilter, setActivityFilter] = useActivityFilter();

  return (
    <div className="mt-10 border-t border-border-primary pt-6">
      <CollapsibleSection
        title="Activity"
        action={<ActivityFilterMenu value={activityFilter} onChange={setActivityFilter} />}
      >
        <ActivityTimeline activity={activity} filter={activityFilter} />
      </CollapsibleSection>
    </div>
  );
}
