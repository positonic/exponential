"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  IconStack2,
  IconTarget,
  IconFileText,
  IconLayoutGrid,
  IconGavel,
  IconMicrophone,
  type Icon,
} from "@tabler/icons-react";
import { NavLink, SectionLabel } from "./NavLinks";
import { useSidebarMode } from "./sidebarMode";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import {
  matchRecentRoute,
  onRecentsChange,
  pushRecent,
  readRecents,
  writeRecents,
  type RecentEntry,
  type RecentKind,
} from "~/lib/recents";

const KIND_ICONS: Record<RecentKind, Icon> = {
  project: IconStack2,
  goal: IconTarget,
  page: IconFileText,
  product: IconLayoutGrid,
  decision: IconGavel,
  meeting: IconMicrophone,
};

const EMPTY: RecentEntry[] = [];

/** The current workspace's recents, live across tabs. */
function useRecents(workspaceId: string | null | undefined): RecentEntry[] {
  // A fresh array on every read would make useSyncExternalStore loop; cache
  // per raw storage string instead.
  return useSyncExternalStore(
    onRecentsChange,
    () => (workspaceId ? readCached(workspaceId) : EMPTY),
    () => EMPTY,
  );
}

let cacheKey = "";
let cacheValue: RecentEntry[] = EMPTY;
function readCached(workspaceId: string): RecentEntry[] {
  const list = readRecents(workspaceId);
  const key = `${workspaceId}:${JSON.stringify(list)}`;
  if (key !== cacheKey) {
    cacheKey = key;
    cacheValue = list;
  }
  return cacheValue;
}

/** How long to give a detail page to render its own heading before we read it. */
const FIRST_READ_MS = 600;
/** A second read, for pages whose data arrives after the first. */
const SECOND_READ_MS = 2500;

/**
 * The name in a heading. A detail page's `h1` often carries more than the
 * name — an avatar's initials, a status chip — and `textContent` would run
 * them together ("OROpen roadmap"). The name is the longest run of text
 * among the heading's direct children, which leaves the decorations behind.
 */
function headingName(heading: Element): string | null {
  let longest = "";
  for (const node of Array.from(heading.childNodes)) {
    const text = node.textContent?.trim() ?? "";
    if (text.length > longest.length) longest = text;
  }
  return longest.length > 0 ? longest : null;
}

/**
 * Finds a name for the entity on screen: the page's main heading, else the
 * document title minus the app's suffix. Null when neither says anything yet.
 */
function readEntityTitle(): string | null {
  const heading = document.querySelector("main h1");
  const name = heading ? headingName(heading) : null;
  if (name) return name;
  const docTitle = document.title.split(" | ")[0]?.trim();
  return docTitle && docTitle.length > 0 ? docTitle : null;
}

/**
 * Records detail-page visits into the workspace's recents. Mounted once in
 * the sidebar; watches the pathname and, for routes {@link matchRecentRoute}
 * recognises, stores the href with the best title it can read off the page.
 * Renders nothing.
 */
export function RecentsRecorder(): null {
  const pathname = usePathname();
  const { workspaceId, workspaceSlug } = useWorkspace();

  useEffect(() => {
    if (!workspaceId || !workspaceSlug) return;
    const match = matchRecentRoute(pathname, workspaceSlug);
    if (!match) return;

    let recordedTitle: string | null = null;
    const record = () => {
      const title = readEntityTitle();
      if (!title || title === recordedTitle) return;
      recordedTitle = title;
      writeRecents(
        workspaceId,
        pushRecent(readRecents(workspaceId), {
          href: match.href,
          title,
          kind: match.kind,
          at: Date.now(),
        }),
      );
    };

    const first = window.setTimeout(record, FIRST_READ_MS);
    const second = window.setTimeout(record, SECOND_READ_MS);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [pathname, workspaceId, workspaceSlug]);

  return null;
}

/**
 * "Recents" sidebar section: the last few entities opened in this workspace
 * on this device, newest first. Hidden when empty and in the rail.
 */
export function RecentsNav(): React.JSX.Element | null {
  const { workspaceId } = useWorkspace();
  const mode = useSidebarMode();
  const recents = useRecents(workspaceId);

  if (mode === "rail" || recents.length === 0) return null;

  return (
    <div className="sb-section">
      <SectionLabel>Recent</SectionLabel>
      <div className="sb-group sb-group--secondary">
        {recents.map((entry) => (
          <NavLink key={entry.href} href={entry.href} icon={KIND_ICONS[entry.kind]} title={entry.title} exact>
            {entry.title}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
