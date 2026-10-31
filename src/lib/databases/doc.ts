import type { JSONContent } from "@tiptap/core";

/**
 * Every `database` node's id in a ProseMirror doc, in document order, once
 * each — the doc-side twin of `collectDatabaseMarkerIds` for Markdown.
 */
export function collectDatabaseNodeIds(doc: JSONContent | null | undefined): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === "database") {
      const databaseId = node.attrs?.databaseId;
      if (typeof databaseId === "string" && databaseId && !seen.has(databaseId)) {
        seen.add(databaseId);
        ids.push(databaseId);
      }
    }
    node.content?.forEach(walk);
  };
  if (doc) walk(doc);
  return ids;
}
