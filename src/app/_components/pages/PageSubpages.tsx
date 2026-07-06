"use client";

import { useState } from "react";
import Link from "next/link";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconFileText, IconWorld, IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";

interface PageSubpagesProps {
  pageId: string;
  workspaceSlug: string;
  editable: boolean;
  /** Detach a child by removing its `pageLink` block from the live editor doc
   * (ADR-0039 — nesting is the body's link graph, so the editor owns the edit).
   * Provided by the editor host; absent → detach controls are hidden. */
  onDetach?: (childId: string) => Promise<void>;
}

/**
 * The "Sub-pages" index on the Page editor: the pages this page links to
 * (`page.children`), in document order, resolved to live titles. A navigation
 * surface that mirrors the inline `pageLink` blocks; when the page is editable
 * it also offers detach (delete the link from this page's body). Renders
 * nothing when the page has no sub-pages.
 */
export function PageSubpages({
  pageId,
  workspaceSlug,
  editable,
  onDetach,
}: PageSubpagesProps) {
  const { data: children, isLoading } = api.page.children.useQuery({
    id: pageId,
  });
  const [detachingId, setDetachingId] = useState<string | null>(null);

  // Render nothing while loading (avoids showing an empty panel before data
  // arrives) and when the page has no viewable sub-pages.
  if (isLoading || !children || children.length === 0) return null;

  const handleDetach = async (childId: string) => {
    if (!onDetach) return;
    setDetachingId(childId);
    try {
      await onDetach(childId);
    } catch {
      notifications.show({
        color: "red",
        title: "Could not remove sub-page",
        message: "Please try again.",
      });
    } finally {
      setDetachingId(null);
    }
  };

  return (
    <section className="mt-8 border-t border-border-primary pt-4">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Sub-pages
      </Text>
      <div className="flex flex-col gap-1">
        {children.map((child) => (
          <div
            key={child.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
          >
            <IconFileText size={15} className="shrink-0 text-text-muted" />
            <Link
              href={`/w/${workspaceSlug}/pages/${child.id}`}
              className="min-w-0 flex-1 truncate text-sm text-text-primary hover:text-brand-primary"
            >
              {child.title}
            </Link>
            {child.isPublic ? (
              <Tooltip label="Published to the web" withArrow>
                <IconWorld size={14} className="shrink-0 text-text-muted" />
              </Tooltip>
            ) : null}
            {editable && onDetach ? (
              <Tooltip label="Remove from this page" withArrow>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="gray"
                  aria-label={`Remove ${child.title} from this page`}
                  loading={detachingId === child.id}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => void handleDetach(child.id)}
                >
                  <IconX size={14} />
                </ActionIcon>
              </Tooltip>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
