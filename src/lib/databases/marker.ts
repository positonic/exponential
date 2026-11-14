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

/** One line: is it a marker? (The non-global twin of the line regex.) */
const MARKER_LINE_RE = new RegExp(`^[ \\t]*<!--\\s*database:(${MARKER_ID})\\s*-->[ \\t]*$`);

/** The trailer `expandDatabaseMarkers` adds under a capped table. */
export const MORE_ROWS_LINE_RE = /^_\d+ more rows? not shown\._$/;

export function isDatabaseMarkerLine(line: string): boolean {
  return MARKER_LINE_RE.test(line);
}

/**
 * Drop the projected table (and "more rows" trailer) that sits directly
 * under each marker, keeping the marker. The Markdown twin of the editor's
 * parse rule: a body read expanded and written back through a Markdown
 * write is stored as markers again, so a later read expands once, never
 * twice, and a stale copy of the table never outlives the rows.
 */
export function stripProjectedTables(body: string): string {
  const lines = body.split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    kept.push(line);
    if (!isDatabaseMarkerLine(line)) continue;
    let next = i + 1;
    while (next < lines.length && lines[next]!.trim() === "") next++;
    if (next >= lines.length || !lines[next]!.trimStart().startsWith("|")) continue;
    let end = next;
    while (end < lines.length && lines[end]!.trimStart().startsWith("|")) end++;
    let trailer = end;
    while (trailer < lines.length && lines[trailer]!.trim() === "") trailer++;
    if (trailer < lines.length && MORE_ROWS_LINE_RE.test(lines[trailer]!.trim())) end = trailer + 1;
    i = end - 1;
  }
  return kept.join("\n");
}

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
