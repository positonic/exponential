"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PropertyValue } from "~/lib/databases/properties";
import type { PropertyDef } from "~/lib/databases/schema";
import { computedValue, displayValue, type DisplayContext } from "~/lib/databases/display";
import { IconPlus } from "@tabler/icons-react";
import { TextCell } from "./cells/TextCell";
import { CheckboxCell } from "./cells/CheckboxCell";
import { SelectCell } from "./cells/SelectCell";
import { DateCell } from "./cells/DateCell";
import { PersonCell } from "./cells/PersonCell";
import type { PickerUser } from "~/app/_components/shared/PersonPicker";
import { PropertyEditorPopover, type PropertyDraft } from "./PropertyEditorPopover";
import styles from "./DatabaseBlock.module.css";

/** The slice of a database the table needs. */
export interface DatabaseTableDefinition {
  properties: PropertyDef[];
  titlePropertyId: string;
}

/** A row as `database.listRows` returns it. */
export interface DatabaseTableRow {
  id: string;
  title: string;
  values: Record<string, PropertyValue | null>;
  createdById: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

interface DatabaseTableProps {
  database: DatabaseTableDefinition;
  rows: DatabaseTableRow[];
  /** Visible property ids in view order (from `listRows`). */
  columns: string[];
  /** Where a row's title links; absent → plain text. */
  rowHref?: (rowId: string) => string;
  display?: DisplayContext;
  /** The workspace whose members person cells offer. */
  workspaceId?: string | null;
  /** Workspace members by id, for person and created-by cells. */
  people?: ReadonlyMap<string, PickerUser>;
  /** Cells edit in place and a "+ New" line appends rows. */
  editable?: boolean;
  /** Write one cell. The title property's value is the row title. */
  onWriteCell?: (rowId: string, propertyId: string, value: unknown) => void | Promise<void>;
  /** Append a row; resolve with its id so the table can start editing its title. */
  onCreateRow?: () => Promise<string | null | undefined> | string | null | undefined;
  /** Schema edits from the header; absent → the header is static. */
  onAddProperty?: (draft: PropertyDraft) => Promise<void> | void;
  onUpdateProperty?: (def: PropertyDef, draft: PropertyDraft) => Promise<void> | void;
  onRemoveProperty?: (def: PropertyDef) => Promise<void> | void;
  /** Add a select option from a cell and resolve with its id. */
  onCreateOption?: (def: PropertyDef, name: string) => Promise<string | null>;
}

interface EditingCell {
  rowId: string;
  propertyId: string;
  /** The keystroke that opened the cell, typed into it. */
  initial?: string;
}

/** Cell types that open an inline text editor. Others edit in their own way or not at all. */
const TEXT_EDITED = new Set(["title", "text", "number", "url"]);
const READ_ONLY = new Set(["createdTime", "lastEditedTime", "createdBy", "relation"]);

function isEditableType(def: PropertyDef): boolean {
  return !READ_ONLY.has(def.type);
}

/**
 * The table a database block renders (ADR-0078 §6): one column per visible
 * property in view order, one line per row, the title linking to the row
 * page. When `editable`, cells edit in place — click a cell to select it,
 * Enter or typing to edit, Enter/Tab/blur to commit, Escape to cancel, arrow
 * keys to move — and the "+ New" line appends a row and opens its title.
 */
export function DatabaseTable({
  database,
  rows,
  columns,
  rowHref,
  display,
  workspaceId,
  people,
  editable = false,
  onWriteCell,
  onCreateRow,
  onAddProperty,
  onUpdateProperty,
  onRemoveProperty,
  onCreateOption,
}: DatabaseTableProps) {
  const byId = new Map(database.properties.map((p) => [p.id, p]));
  const visible = columns.map((id) => byId.get(id)).filter((p): p is PropertyDef => !!p);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const canEdit = editable && !!onWriteCell;
  const canEditSchema = editable && !!onUpdateProperty;
  const peopleById = people ?? new Map<string, PickerUser>();
  const displayCtx: DisplayContext = {
    personName: (id) => {
      const user = peopleById.get(id);
      return user ? (user.name ?? user.email ?? undefined) : display?.personName?.(id);
    },
    ...display,
  };

  // A row that vanished (deleted, filtered out) ends any edit on it.
  useEffect(() => {
    if (editing && !rows.some((r) => r.id === editing.rowId)) setEditing(null);
  }, [editing, rows]);

  const focusCell = useCallback((rowIndex: number, colIndex: number) => {
    const cell = tableRef.current?.querySelector<HTMLTableCellElement>(
      `td[data-row-index="${rowIndex}"][data-col-index="${colIndex}"]`,
    );
    cell?.focus();
  }, []);

  const commit = (rowId: string, def: PropertyDef, value: unknown) => {
    setEditing(null);
    void onWriteCell?.(rowId, def.id, value);
  };

  const startEditing = (row: DatabaseTableRow, def: PropertyDef, initial?: string) => {
    if (!canEdit || !isEditableType(def)) return;
    if (!TEXT_EDITED.has(def.type)) return; // checkboxes flip, selects open their own picker
    setEditing({ rowId: row.id, propertyId: def.id, initial });
  };

  const onCellKeyDown = (
    e: React.KeyboardEvent<HTMLTableCellElement>,
    row: DatabaseTableRow,
    def: PropertyDef,
    rowIndex: number,
    colIndex: number,
  ) => {
    if (editing) return; // the input owns the keys while open
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusCell(rowIndex, colIndex + 1);
        return;
      case "ArrowLeft":
        e.preventDefault();
        focusCell(rowIndex, colIndex - 1);
        return;
      case "ArrowDown":
        e.preventDefault();
        focusCell(rowIndex + 1, colIndex);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusCell(rowIndex - 1, colIndex);
        return;
      case "Enter":
      case "F2":
        if (!canEdit) return;
        if (def.type === "checkbox") {
          e.preventDefault();
          commit(row.id, def, row.values[def.id] !== true);
        } else if (
          def.type === "select" ||
          def.type === "multiSelect" ||
          def.type === "date" ||
          def.type === "person"
        ) {
          // The pill button inside the cell opens the picker on Enter.
          e.currentTarget.querySelector<HTMLButtonElement>("button")?.click();
        } else {
          e.preventDefault();
          startEditing(row, def);
        }
        return;
      case " ":
        if (canEdit && def.type === "checkbox") {
          e.preventDefault();
          commit(row.id, def, row.values[def.id] !== true);
        }
        return;
      default:
        // A printable key starts editing with that character, as in a spreadsheet.
        if (canEdit && TEXT_EDITED.has(def.type) && e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault();
          startEditing(row, def, e.key);
        }
    }
  };

  const handleCreateRow = async () => {
    if (!onCreateRow) return;
    const id = await onCreateRow();
    if (id) setEditing({ rowId: id, propertyId: database.titlePropertyId });
  };

  const renderCell = (row: DatabaseTableRow, def: PropertyDef) => {
    const isTitle = def.id === database.titlePropertyId || def.type === "title";
    const isEditing = editing?.rowId === row.id && editing.propertyId === def.id;
    const raw = isTitle ? row.title : (computedValue(def, row) ?? row.values[def.id]);
    const text = isTitle ? row.title || "Untitled" : displayValue(def, raw, displayCtx);

    if (def.type === "checkbox") {
      return (
        <CheckboxCell
          def={def}
          value={typeof raw === "boolean" ? raw : null}
          editable={canEdit}
          onCommit={(next) => commit(row.id, def, next)}
        />
      );
    }
    if (def.type === "date") {
      return (
        <DateCell
          def={def}
          value={typeof raw === "string" ? raw : null}
          editable={canEdit}
          onCommit={(next) => commit(row.id, def, next)}
        />
      );
    }
    if (def.type === "person" || def.type === "createdBy") {
      return (
        <PersonCell
          def={def}
          value={Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : null}
          workspaceId={workspaceId}
          people={peopleById}
          editable={canEdit && def.type === "person"}
          onCommit={(next) => commit(row.id, def, next)}
        />
      );
    }
    if (def.type === "select" || def.type === "multiSelect") {
      return (
        <SelectCell
          def={def}
          value={typeof raw === "string" || Array.isArray(raw) ? raw : null}
          editable={canEdit}
          onCommit={(next) => commit(row.id, def, next)}
          onCreateOption={onCreateOption ? (name) => onCreateOption(def, name) : undefined}
        />
      );
    }
    if (isEditing && TEXT_EDITED.has(def.type)) {
      return (
        <TextCell
          def={def}
          value={isTitle ? row.title : typeof raw === "string" || typeof raw === "number" ? raw : null}
          display={text}
          editing
          initial={editing?.initial}
          onCommit={(next) => commit(row.id, def, next)}
          onCancel={() => setEditing(null)}
        />
      );
    }
    if (isTitle) {
      return rowHref ? (
        <Link href={rowHref(row.id)} onClick={(e) => e.stopPropagation()}>
          {text}
        </Link>
      ) : (
        <span className={styles.cellText}>{text}</span>
      );
    }
    if (TEXT_EDITED.has(def.type)) {
      return (
        <TextCell
          def={def}
          value={typeof raw === "string" || typeof raw === "number" ? raw : null}
          display={text}
          editing={false}
          onCommit={() => undefined}
          onCancel={() => undefined}
        />
      );
    }
    return <span className={styles.cellText}>{text}</span>;
  };

  return (
    <div className={styles.tableWrap}>
      <table ref={tableRef} className={styles.table} data-editable={canEdit ? "true" : "false"}>
        <thead>
          <tr>
            {visible.map((def) => (
              <th key={def.id} scope="col">
                {canEditSchema ? (
                  <PropertyEditorPopover
                    property={def}
                    target={<span>{def.name}</span>}
                    onSubmit={(draft) => onUpdateProperty?.(def, draft)}
                    onRemove={onRemoveProperty && def.type !== "title" ? () => onRemoveProperty(def) : undefined}
                  />
                ) : (
                  def.name
                )}
              </th>
            ))}
            {canEditSchema && onAddProperty ? (
              <th scope="col" className={styles.addColumn}>
                <PropertyEditorPopover
                  target={
                    <span className="inline-flex items-center gap-1">
                      <IconPlus size={12} /> Property
                    </span>
                  }
                  onSubmit={(draft) => onAddProperty(draft)}
                />
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !canEdit ? (
            <tr>
              <td className={styles.empty} colSpan={Math.max(visible.length, 1) + (canEditSchema && onAddProperty ? 1 : 0)}>
                No rows yet.
              </td>
            </tr>
          ) : (
            rows.map((row, rowIndex) => (
              <tr key={row.id} data-row-id={row.id}>
                {visible.map((def, colIndex) => {
                  const isTitle = def.id === database.titlePropertyId || def.type === "title";
                  const cellEditable = canEdit && isEditableType(def);
                  return (
                    <td
                      key={def.id}
                      className={`${styles.cell} ${isTitle ? styles.titleCell : ""}`}
                      data-row-index={rowIndex}
                      data-col-index={colIndex}
                      data-property-id={def.id}
                      data-editable={cellEditable ? "true" : "false"}
                      tabIndex={canEdit ? 0 : undefined}
                      onClick={(e) => {
                        if (!canEdit) return;
                        e.currentTarget.focus();
                      }}
                      onDoubleClick={() => startEditing(row, def)}
                      onKeyDown={(e) => onCellKeyDown(e, row, def, rowIndex, colIndex)}
                    >
                      {renderCell(row, def)}
                    </td>
                  );
                })}
                {canEditSchema && onAddProperty ? <td className={styles.addColumn} /> : null}
              </tr>
            ))
          )}
          {canEdit && onCreateRow ? (
            <tr className={styles.newRow}>
              <td colSpan={Math.max(visible.length, 1) + (canEditSchema && onAddProperty ? 1 : 0)}>
                <button type="button" className={styles.newRowButton} onClick={() => void handleCreateRow()}>
                  + New
                </button>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
