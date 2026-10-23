/**
 * The sidebar's Recents: the last few entities this person opened in a
 * workspace, kept in the browser so a session can resume where it left off.
 *
 * It is a per-device convenience, not a record, so localStorage is the store:
 * nothing here needs to survive a device change or be read by anyone else.
 * Every read and write is guarded, since storage can be absent or throwing in
 * private windows and previews.
 */

export type RecentKind =
  | 'project'
  | 'goal'
  | 'page'
  | 'product'
  | 'decision'
  | 'meeting';

export interface RecentEntry {
  /** Workspace-relative app path, e.g. `/w/acme/projects/launch-abc`. */
  href: string;
  title: string;
  kind: RecentKind;
  /** Epoch ms of the last visit. */
  at: number;
}

export const RECENTS_LIMIT = 5;

const STORAGE_VERSION = 'v1';

export function recentsStorageKey(workspaceId: string): string {
  return `sb-recents:${STORAGE_VERSION}:${workspaceId}`;
}

/**
 * Detail routes worth remembering, as the route segment under
 * `/w/:workspaceSlug/` and the kind it opens. List pages (`/projects` alone)
 * are already one click away in the nav and are left out.
 */
const DETAIL_ROUTES: ReadonlyArray<{ segment: string; kind: RecentKind }> = [
  { segment: 'projects', kind: 'project' },
  { segment: 'goals', kind: 'goal' },
  { segment: 'pages', kind: 'page' },
  { segment: 'products', kind: 'product' },
  { segment: 'decisions', kind: 'decision' },
  { segment: 'ceremonies', kind: 'meeting' },
];

/** Sub-paths under a detail segment that are not an entity (e.g. `/products/new`). */
const NOT_AN_ENTITY = new Set(['new', 'd', 'graph']);

/**
 * Classifies a pathname as a detail page of a known kind, or null for
 * anything else. Returns the entity's canonical href (query string dropped,
 * nested tabs under the entity dropped) so revisits dedupe to one entry.
 */
export function matchRecentRoute(
  pathname: string,
  workspaceSlug: string,
): { kind: RecentKind; href: string } | null {
  const prefix = `/w/${workspaceSlug}/`;
  if (!pathname.startsWith(prefix)) return null;
  const parts = pathname.slice(prefix.length).split('/').filter(Boolean);
  const [segment, id] = parts;
  if (!segment || !id || NOT_AN_ENTITY.has(id)) return null;
  const route = DETAIL_ROUTES.find((r) => r.segment === segment);
  if (!route) return null;
  // A meeting occurrence is `/ceremonies/:ceremonyId/:occurrenceId`; the
  // ceremony alone is a series, not a visit.
  if (route.kind === 'meeting') {
    const occurrence = parts[2];
    if (!occurrence) return null;
    return { kind: 'meeting', href: `${prefix}${segment}/${id}/${occurrence}` };
  }
  return { kind: route.kind, href: `${prefix}${segment}/${id}` };
}

function isRecentEntry(value: unknown): value is RecentEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.href === 'string' &&
    typeof v.title === 'string' &&
    typeof v.kind === 'string' &&
    typeof v.at === 'number'
  );
}

export function readRecents(workspaceId: string): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(recentsStorageKey(workspaceId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentEntry).slice(0, RECENTS_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Puts `entry` at the top of the list, replacing any earlier visit to the same
 * href, and trims to {@link RECENTS_LIMIT}. Pure: the caller persists.
 */
export function pushRecent(list: RecentEntry[], entry: RecentEntry): RecentEntry[] {
  const rest = list.filter((e) => e.href !== entry.href);
  return [entry, ...rest].slice(0, RECENTS_LIMIT);
}

const CHANGE_EVENT = 'exponential:recents:change';

export function writeRecents(workspaceId: string, list: RecentEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(recentsStorageKey(workspaceId), JSON.stringify(list));
  } catch {
    // Storage unavailable: the list simply does not persist.
  }
  // `storage` events only fire in *other* tabs; tell this one too.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { workspaceId } }));
}

/** Subscribes to recents changes from this tab and others; returns the unsubscribe. */
export function onRecentsChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}
