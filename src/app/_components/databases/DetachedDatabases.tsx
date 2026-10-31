"use client";

import { useState } from "react";
import { ActionIcon, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconArrowBackUp, IconTable, IconTrash } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import type { RichDocEditorHandle } from "~/app/_components/shared/RichDocEditor";

export interface DetachedDatabase {
  id: string;
  name: string;
  rowCount?: number;
  detachedAt: Date | string | null;
}

interface DetachedDatabasesViewProps {
  databases: DetachedDatabase[];
  editable: boolean;
  onRestore?: (database: DetachedDatabase) => Promise<void> | void;
  onDelete?: (database: DetachedDatabase) => Promise<void> | void;
}

/**
 * "Removed databases" under a page body (ADR-0078): databases whose block
 * was taken out of the page. Their rows are kept for 30 days; Restore puts
 * the block back at the end of the body, Delete removes database and rows
 * now. Renders nothing when there is nothing detached.
 */
export function DetachedDatabasesView({ databases, editable, onRestore, onDelete }: DetachedDatabasesViewProps) {
  const [busy, setBusy] = useState<string | null>(null);
  if (databases.length === 0) return null;

  const run = async (database: DetachedDatabase, action: ((d: DetachedDatabase) => Promise<void> | void) | undefined, failure: string) => {
    if (!action) return;
    setBusy(database.id);
    try {
      await action(database);
    } catch {
      notifications.show({ color: "red", title: failure, message: "Please try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-8" data-testid="detached-databases">
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Removed databases ({databases.length})
      </Text>
      <div className="flex flex-col gap-1">
        {databases.map((database) => (
          <div
            key={database.id}
            className="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover"
          >
            <IconTable size={15} className="shrink-0 text-text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm text-text-primary">
              {database.name}
              {typeof database.rowCount === "number" ? (
                <span className="ml-2 text-xs text-text-muted">
                  {database.rowCount} row{database.rowCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </span>
            {editable ? (
              <>
                <Tooltip label="Put the block back in the page" withArrow>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    aria-label={`Restore ${database.name}`}
                    loading={busy === database.id}
                    onClick={() => void run(database, onRestore, "Could not restore the database")}
                  >
                    <IconArrowBackUp size={14} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Delete the database and its rows" withArrow>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    aria-label={`Delete ${database.name}`}
                    loading={busy === database.id}
                    onClick={() => void run(database, onDelete, "Could not delete the database")}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Tooltip>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

interface DetachedDatabasesProps {
  pageId: string;
  editable: boolean;
  /** The live editor, so Restore can put the node back; absent → Restore is hidden. */
  editorHandle: RichDocEditorHandle | null;
}

/** The row wired to `database.list`; Restore inserts the node and saves, which re-attaches the database. */
export function DetachedDatabases({ pageId, editable, editorHandle }: DetachedDatabasesProps) {
  const utils = api.useUtils();
  const { data } = api.database.list.useQuery({ pageId });
  const deleteDatabase = api.database.delete.useMutation();
  const detached = (data ?? []).filter((d) => d.detachedAt !== null);

  const refresh = () =>
    Promise.all([utils.database.list.invalidate({ pageId }), utils.page.get.invalidate({ id: pageId })]);

  return (
    <DetachedDatabasesView
      databases={detached}
      editable={editable}
      onRestore={
        editorHandle?.editor
          ? async (database) => {
              editorHandle.editor
                ?.chain()
                .focus("end")
                .insertContent({ type: "database", attrs: { databaseId: database.id, name: database.name } })
                .run();
              await editorHandle.flushSave();
              await refresh();
            }
          : undefined
      }
      onDelete={async (database) => {
        await deleteDatabase.mutateAsync({ id: database.id });
        await refresh();
      }}
    />
  );
}
