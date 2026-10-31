/**
 * How a Database block appears in a page's Markdown `body` (ADR-0078).
 *
 * The stored body holds a **marker only** — `<!-- database:<id> -->` on its
 * own line — never rows: the client derives `body` from the ProseMirror doc
 * synchronously, with nothing but the node's attrs in hand. Readers expand the
 * marker into a table at read time (`expandDatabaseMarkers`), and the editor's
 * parse rule turns a marker — plus any table that follows it — back into the
 * node, so a round-tripped body keeps the block and writes nothing to rows.
 */

const MARKER_ID = "[A-Za-z0-9_-]+";

/** The marker line for one database. */
export function databaseMarker(databaseId: string): string {
  return `<!-- database:${databaseId} -->`;
}

/** Matches a marker that stands on its own line; group 1 is the database id. */
export const DATABASE_MARKER_LINE_RE = new RegExp(
  `^[ \\t]*<!--\\s*database:(${MARKER_ID})\\s*-->[ \\t]*$`,
  "gm",
);

/** Every database id a body's markers name, in document order, without repeats. */
export function collectDatabaseMarkerIds(body: string | null | undefined): string[] {
  if (!body) return [];
  const ids: string[] = [];
  for (const match of body.matchAll(DATABASE_MARKER_LINE_RE)) {
    const id = match[1]!;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function hasDatabaseMarker(body: string | null | undefined): boolean {
  return collectDatabaseMarkerIds(body).length > 0;
}
