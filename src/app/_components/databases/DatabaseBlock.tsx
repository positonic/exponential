"use client";

import { useEffect } from "react";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { IconTable } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { DatabaseNode } from "~/lib/prd/database-node";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { usePageEditorContext } from "~/app/_components/pages/PageEditorContext";
import { DatabaseTable } from "./DatabaseTable";
import styles from "./DatabaseBlock.module.css";

/** Rows the block loads at once; the saved view pages beyond this (load more arrives with the view controls). */
export const BLOCK_ROW_LIMIT = 200;

/**
 * Interactive node view for the {@link DatabaseNode} block (ADR-0078): the
 * database's table, read from `database.get` and `database.listRows` through
 * the saved view. The node carries only the id and a cached `name`; the
 * schema, view and rows live in the database, so a cell edit never touches
 * the document. While the doc is editable the live name is synced back into
 * the attr so the atom's fallback rendering stays current.
 */
function DatabaseBlock({ node, editor, updateAttributes, selected }: NodeViewProps) {
  const databaseId = node.attrs.databaseId as string | null;
  const cachedName = (node.attrs.name as string | null) ?? "Database";
  const pageCtx = usePageEditorContext();
  const { workspace } = useWorkspace();
  const workspaceSlug = pageCtx?.workspaceSlug ?? workspace?.slug ?? null;

  const databaseQuery = api.database.get.useQuery(
    { id: databaseId ?? "" },
    { enabled: !!databaseId, retry: false },
  );
  const rowsQuery = api.database.listRows.useQuery(
    { id: databaseId ?? "", limit: BLOCK_ROW_LIMIT },
    { enabled: !!databaseId, retry: false },
  );
  const database = databaseQuery.data;
  const liveName = database?.name;

  useEffect(() => {
    if (editor.isEditable && liveName && liveName !== cachedName) {
      updateAttributes({ name: liveName });
    }
  }, [editor.isEditable, liveName, cachedName, updateAttributes]);

  const name = liveName ?? cachedName;
  const rowCount = database?.rowCount;

  let body: React.ReactNode;
  if (!databaseId) {
    body = <div className={styles.state}>This block points at no database.</div>;
  } else if (databaseQuery.isError) {
    body = (
      <div className={styles.state}>
        {databaseQuery.error.data?.code === "NOT_FOUND"
          ? "This database was deleted."
          : "This database could not be loaded."}
      </div>
    );
  } else if (!database || !rowsQuery.data) {
    body = <div className={styles.state}>Loading…</div>;
  } else {
    body = (
      <DatabaseTable
        database={database}
        rows={rowsQuery.data.rows}
        columns={rowsQuery.data.columns}
        rowHref={workspaceSlug ? (rowId) => buildPageEditorPath(workspaceSlug, rowId) : undefined}
      />
    );
  }

  return (
    <NodeViewWrapper
      data-type="database"
      data-database-id={databaseId ?? undefined}
      className={styles.block}
      data-selected={selected ? "true" : "false"}
      contentEditable={false}
    >
      <div className={styles.header}>
        <IconTable size={16} className="shrink-0 text-text-muted" />
        <span className={styles.name}>{name}</span>
        {typeof rowCount === "number" ? (
          <span className={styles.meta}>
            {rowCount} row{rowCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>
      {body}
    </NodeViewWrapper>
  );
}

/** The {@link DatabaseNode} with the table view attached — what the live editor uses. */
export const DatabaseWithView = DatabaseNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(DatabaseBlock);
  },
});
