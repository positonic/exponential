"use client";

import Link from "next/link";
import type { PropertyValue } from "~/lib/databases/properties";
import type { PropertyDef } from "~/lib/databases/schema";
import { computedValue, displayValue, type DisplayContext } from "~/lib/databases/display";
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
}

/**
 * The table a database block renders (ADR-0078 §6): one column per visible
 * property in view order, one line per row, the title linking to the row
 * page. Read-only here; the editable cells layer on top of it.
 */
export function DatabaseTable({ database, rows, columns, rowHref, display }: DatabaseTableProps) {
  const byId = new Map(database.properties.map((p) => [p.id, p]));
  const visible = columns.map((id) => byId.get(id)).filter((p): p is PropertyDef => !!p);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {visible.map((def) => (
              <th key={def.id} scope="col">
                {def.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={styles.empty} colSpan={Math.max(visible.length, 1)}>
                No rows yet.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} data-row-id={row.id}>
                {visible.map((def) => {
                  const isTitle = def.id === database.titlePropertyId || def.type === "title";
                  if (isTitle) {
                    const title = row.title || "Untitled";
                    return (
                      <td key={def.id} className={styles.titleCell}>
                        {rowHref ? <Link href={rowHref(row.id)}>{title}</Link> : title}
                      </td>
                    );
                  }
                  const value = computedValue(def, row) ?? row.values[def.id];
                  return <td key={def.id}>{displayValue(def, value, display)}</td>;
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
