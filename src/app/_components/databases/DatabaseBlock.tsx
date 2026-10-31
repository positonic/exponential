"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import type { DatabaseView, PropertyDef } from "~/lib/databases/schema";
import type { PickerUser } from "~/app/_components/shared/PersonPicker";
import { DatabaseTable } from "./DatabaseTable";
import type { PropertyDraft } from "./PropertyEditorPopover";
import { ViewControls } from "./ViewControls";
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
  const workspaceId = pageCtx?.workspaceId ?? workspace?.id ?? null;
  const editable = pageCtx?.editable ?? editor.isEditable;
  const utils = api.useUtils();

  // Members by id for person and created-by cells — one shared query per
  // workspace, the same one PersonPicker reads.
  const { data: members } = api.workspace.listMembers.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId, staleTime: 60_000 },
  );
  const people = useMemo(() => {
    const map = new Map<string, PickerUser>();
    for (const m of members ?? []) map.set(m.id, { id: m.id, name: m.name, email: m.email, image: m.image });
    return map;
  }, [members]);

  // What a new relation property may point at: the workspace's databases
  // the editor can read, in the header's property editor.
  const { data: relatable } = api.database.listInWorkspace.useQuery(
    { workspaceId: workspaceId ?? "" },
    { enabled: !!workspaceId && editable, staleTime: 60_000 },
  );
  const relatableDatabases = useMemo(
    () => relatable?.map((d) => ({ id: d.id, name: d.name, pageTitle: d.page.title })),
    [relatable],
  );

  const rowsKey = { id: databaseId ?? "", limit: BLOCK_ROW_LIMIT };
  const databaseQuery = api.database.get.useQuery(
    { id: databaseId ?? "" },
    { enabled: !!databaseId, retry: false },
  );
  // Pages of rows through the saved view; "Load more" fetches the next.
  const rowsQuery = api.database.listRows.useInfiniteQuery(rowsKey, {
    enabled: !!databaseId,
    retry: false,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rowPages = rowsQuery.data?.pages;
  const rows = useMemo(() => rowPages?.flatMap((p) => p.rows) ?? [], [rowPages]);
  const columns = rowPages?.[0]?.columns;
  const updateRow = api.database.updateRow.useMutation();
  const createRow = api.database.createRow.useMutation();
  const addProperty = api.database.addProperty.useMutation();
  const updateProperty = api.database.updateProperty.useMutation();
  const removeProperty = api.database.removeProperty.useMutation();
  const updateDatabase = api.database.update.useMutation();
  const [renaming, setRenaming] = useState<string | null>(null);
  const database = databaseQuery.data;
  const liveName = database?.name;

  useEffect(() => {
    if (editor.isEditable && liveName && liveName !== cachedName) {
      updateAttributes({ name: liveName });
    }
  }, [editor.isEditable, liveName, cachedName, updateAttributes]);

  /** Edit the cached rows across every loaded page; `append` adds to the last page. */
  const setRows = useCallback(
    (update: (rows: Row[]) => Row[], append?: Row) => {
      utils.database.listRows.setInfiniteData(rowsKey, (old) => {
        if (!old) return old;
        const pages = old.pages.map((page) => ({ ...page, rows: update(page.rows) }));
        if (append && pages.length) {
          const last = pages[pages.length - 1]!;
          pages[pages.length - 1] = { ...last, rows: [...last.rows, append] };
        }
        return { ...old, pages };
      });
    },
    // rowsKey is rebuilt each render but only its id matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [utils, databaseId],
  );

  /** Write one cell: apply it to the cached rows at once, confirm with the server's row, roll back if refused. */
  const writeCell = useCallback(
    async (rowId: string, propertyId: string, value: unknown) => {
      if (!database) return;
      const previous = utils.database.listRows.getInfiniteData(rowsKey);
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
        utils.database.listRows.setInfiniteData(rowsKey, previous);
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
      setRows((rows) => rows, row);
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

  /** After a schema change: fresh definition and columns, rows re-read through the view. */
  const refetchSchema = useCallback(async () => {
    if (!databaseId) return;
    await Promise.all([
      utils.database.get.invalidate({ id: databaseId }),
      utils.database.listRows.invalidate({ id: databaseId }),
    ]);
  }, [databaseId, utils]);

  const failed = (title: string, error: unknown) =>
    notifications.show({
      color: "red",
      title,
      message: error instanceof Error ? error.message : "Please try again.",
    });

  const onAddProperty = useCallback(
    async (draft: PropertyDraft) => {
      if (!databaseId || draft.type === "title") return;
      if (draft.type === "relation" && !draft.relation) return;
      try {
        const result = await addProperty.mutateAsync({ id: databaseId, ...draft, type: draft.type });
        await refetchSchema();
        // A two-way relation gave the other database a column: its block, if
        // it is on this page, re-reads too.
        if (result.reverse) {
          await Promise.all([
            utils.database.get.invalidate({ id: result.reverse.databaseId }),
            utils.database.listRows.invalidate({ id: result.reverse.databaseId }),
          ]);
        }
      } catch (error) {
        failed("Could not add the property", error);
      }
    },
    [addProperty, databaseId, refetchSchema, utils],
  );

  const onUpdateProperty = useCallback(
    async (def: PropertyDef, draft: PropertyDraft) => {
      if (!databaseId) return;
      try {
        await updateProperty.mutateAsync({
          id: databaseId,
          propertyId: def.id,
          name: draft.name,
          ...(draft.type !== def.type && draft.type !== "title" && draft.type !== "relation" ? { type: draft.type } : {}),
          ...(draft.options ? { options: draft.options } : {}),
        });
        await refetchSchema();
      } catch (error) {
        failed("Could not save the property", error);
      }
    },
    [databaseId, refetchSchema, updateProperty],
  );

  const onRemoveProperty = useCallback(
    async (def: PropertyDef) => {
      if (!databaseId) return;
      try {
        await removeProperty.mutateAsync({ id: databaseId, propertyId: def.id });
        await refetchSchema();
      } catch (error) {
        failed("Could not remove the property", error);
      }
    },
    [databaseId, refetchSchema, removeProperty],
  );

  /** Add one option to a select property from a cell; existing options keep their ids. */
  const onCreateOption = useCallback(
    async (def: PropertyDef, optionName: string) => {
      if (!databaseId) return null;
      try {
        const result = await updateProperty.mutateAsync({
          id: databaseId,
          propertyId: def.id,
          options: [...(def.options ?? []), { name: optionName }],
        });
        await refetchSchema();
        return (
          result.property.options?.find((o) => o.name.trim().toLowerCase() === optionName.trim().toLowerCase())?.id ??
          null
        );
      } catch (error) {
        failed("Could not add the option", error);
        return null;
      }
    },
    [databaseId, refetchSchema, updateProperty],
  );

  /** Save the view whole (ADR-0078 §6: one view per block), then re-read rows through it. */
  const saveView = useCallback(
    async (next: DatabaseView) => {
      if (!databaseId) return;
      // Show the new view at once; the server's copy replaces it on refetch.
      utils.database.get.setData({ id: databaseId }, (old) => (old ? { ...old, view: next } : old));
      try {
        await updateDatabase.mutateAsync({ id: databaseId, view: next });
        await refetchSchema();
      } catch (error) {
        await utils.database.get.invalidate({ id: databaseId });
        failed("Could not save the view", error);
      }
    },
    [databaseId, refetchSchema, updateDatabase, utils],
  );

  const commitName = async () => {
    const next = renaming?.trim();
    setRenaming(null);
    if (!databaseId || !next || next === liveName) return;
    try {
      await updateDatabase.mutateAsync({ id: databaseId, name: next });
      await utils.database.get.invalidate({ id: databaseId });
    } catch (error) {
      failed("Could not rename the database", error);
    }
  };

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
  } else if (!database || !columns) {
    body = <div className={styles.state}>Loading…</div>;
  } else {
    body = (
      <DatabaseTable
        database={database}
        rows={rows}
        columns={columns}
        view={database.view}
        onReorderColumns={(propertyIds) => void saveView({ ...database.view, propertyOrder: propertyIds })}
        onResizeColumn={(propertyId, width) =>
          void saveView({ ...database.view, columnWidths: { ...database.view.columnWidths, [propertyId]: width } })
        }
        hasMore={rowsQuery.hasNextPage}
        isLoadingMore={rowsQuery.isFetchingNextPage}
        onLoadMore={() => void rowsQuery.fetchNextPage()}
        rowHref={workspaceSlug ? (rowId) => buildPageEditorPath(workspaceSlug, rowId) : undefined}
        workspaceId={workspaceId}
        people={people}
        editable={editable}
        onWriteCell={writeCell}
        onCreateRow={addRow}
        onAddProperty={onAddProperty}
        onUpdateProperty={onUpdateProperty}
        onRemoveProperty={onRemoveProperty}
        relatableDatabases={relatableDatabases}
        onCreateOption={onCreateOption}
      />
    );
  }

  return (
    <NodeViewWrapper
      data-type="database"
      data-database-id={databaseId ?? undefined}
      className={styles.block}
      data-selected={selected ? "true" : "false"}
      aria-busy={updateRow.isPending}
      contentEditable={false}
    >
      <div className={styles.header}>
        <IconTable size={16} className="shrink-0 text-text-muted" />
        {renaming !== null ? (
          <input
            className={styles.nameInput}
            value={renaming}
            autoFocus
            aria-label="Database name"
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitName();
              if (e.key === "Escape") setRenaming(null);
              e.stopPropagation();
            }}
          />
        ) : (
          <span
            className={styles.name}
            role={editable ? "button" : undefined}
            tabIndex={editable ? 0 : undefined}
            title={editable ? "Rename" : undefined}
            onClick={() => editable && setRenaming(name)}
            onKeyDown={(e) => {
              if (editable && e.key === "Enter") setRenaming(name);
            }}
          >
            {name}
          </span>
        )}
        {typeof rowCount === "number" ? (
          <span className={styles.meta}>
            {rowCount} row{rowCount === 1 ? "" : "s"}
          </span>
        ) : null}
        {database && editable ? (
          <ViewControls properties={database.properties} view={database.view} onChangeView={(next) => void saveView(next)} />
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
