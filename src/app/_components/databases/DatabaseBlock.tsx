"use client";

import { useCallback, useEffect } from "react";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { notifications } from "@mantine/notifications";
import { IconTable } from "@tabler/icons-react";
import { api, type RouterOutputs } from "~/trpc/react";
import { useWorkspace } from "~/providers/WorkspaceProvider";
import { DatabaseNode } from "~/lib/prd/database-node";
import { buildPageEditorPath } from "~/lib/pages/page-path";
import { usePageEditorContext } from "~/app/_components/pages/PageEditorContext";
import { DatabaseTable } from "./DatabaseTable";
import styles from "./DatabaseBlock.module.css";

/** Rows the block loads at once; the saved view pages beyond this (load more arrives with the view controls). */
export const BLOCK_ROW_LIMIT = 200;

type RowsPage = RouterOutputs["database"]["listRows"];
type Row = RowsPage["rows"][number];

/**
 * Interactive node view for the {@link DatabaseNode} block (ADR-0078): the
 * database's table, read from `database.get` and `database.listRows` through
 * the saved view. The node carries only the id and a cached `name`; the
 * schema, view and rows live in the database, so a cell edit never touches
 * the document — it goes to `database.updateRow`, optimistically applied to
 * the cached rows and rolled back (with the server's reason, which names the
 * property) if refused. While the doc is editable the live name is synced
 * back into the attr so the atom's fallback rendering stays current.
 */
function DatabaseBlock({ node, editor, updateAttributes, selected }: NodeViewProps) {
  const databaseId = node.attrs.databaseId as string | null;
  const cachedName = (node.attrs.name as string | null) ?? "Database";
  const pageCtx = usePageEditorContext();
  const { workspace } = useWorkspace();
  const workspaceSlug = pageCtx?.workspaceSlug ?? workspace?.slug ?? null;
  const editable = pageCtx?.editable ?? editor.isEditable;
  const utils = api.useUtils();

  const rowsKey = { id: databaseId ?? "", limit: BLOCK_ROW_LIMIT };
  const databaseQuery = api.database.get.useQuery(
    { id: databaseId ?? "" },
    { enabled: !!databaseId, retry: false },
  );
  const rowsQuery = api.database.listRows.useQuery(rowsKey, { enabled: !!databaseId, retry: false });
  const updateRow = api.database.updateRow.useMutation();
  const createRow = api.database.createRow.useMutation();
  const database = databaseQuery.data;
  const liveName = database?.name;

  useEffect(() => {
    if (editor.isEditable && liveName && liveName !== cachedName) {
      updateAttributes({ name: liveName });
    }
  }, [editor.isEditable, liveName, cachedName, updateAttributes]);

  const setRows = useCallback(
    (update: (rows: Row[]) => Row[]) => {
      utils.database.listRows.setData(rowsKey, (old) => (old ? { ...old, rows: update(old.rows) } : old));
    },
    // rowsKey is rebuilt each render but only its id matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [utils, databaseId],
  );

  /** Write one cell: apply it to the cached rows at once, confirm with the server's row, roll back if refused. */
  const writeCell = useCallback(
    async (rowId: string, propertyId: string, value: unknown) => {
      if (!database) return;
      const previous = utils.database.listRows.getData(rowsKey);
      const isTitle = propertyId === database.titlePropertyId;
      setRows((rows) =>
        rows.map((row) =>
          row.id !== rowId
            ? row
            : isTitle
              ? { ...row, title: typeof value === "string" ? value : "" }
              : { ...row, values: { ...row.values, [propertyId]: value as Row["values"][string] } },
        ),
      );
      try {
        const saved = await updateRow.mutateAsync({ rowId, values: { [propertyId]: value } });
        setRows((rows) => rows.map((row) => (row.id === rowId ? saved : row)));
        void utils.page.get.invalidate({ id: rowId });
      } catch (error) {
        utils.database.listRows.setData(rowsKey, previous);
        notifications.show({
          color: "red",
          title: "Not saved",
          message: error instanceof Error ? error.message : "The value was refused.",
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [database, databaseId, setRows, updateRow, utils],
  );

  /** Append an empty row and return its id so the table can open its title. */
  const addRow = useCallback(async () => {
    if (!databaseId) return null;
    try {
      const row = await createRow.mutateAsync({ id: databaseId, values: {} });
      setRows((rows) => [...rows, row]);
      void utils.database.get.invalidate({ id: databaseId });
      return row.id;
    } catch (error) {
      notifications.show({
        color: "red",
        title: "Could not add a row",
        message: error instanceof Error ? error.message : "Please try again.",
      });
      return null;
    }
  }, [createRow, databaseId, setRows, utils]);

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
        editable={editable}
        onWriteCell={writeCell}
        onCreateRow={addRow}
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
