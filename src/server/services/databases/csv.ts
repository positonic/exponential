/**
 * The server half of a CSV import (ADR-0078, V4): what the pure preview
 * cannot know. Person cells may name members by email, which only the
 * database can turn into ids; select cells may name options the commit
 * creates first, after which their names become ids.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

import type { CsvPreview, CsvPreviewColumn } from "~/lib/databases/csv";
import { findOption } from "~/lib/databases/properties";
import type { PropertyDef } from "~/lib/databases/schema";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Person cells: a token with an `@` is an email, resolved to a member of
 * the workspace; one that matches nobody is a cell error on its row. Ids
 * pass through. Mutates the preview rows in place.
 */
export async function resolvePersonEmails(
  db: Db,
  workspaceId: string,
  columns: readonly CsvPreviewColumn[],
  preview: CsvPreview,
): Promise<void> {
  const personColumns = columns.filter((c) => c.def?.type === "person");
  if (personColumns.length === 0) return;
  const emails = new Set<string>();
  for (const row of preview.rows) {
    for (const column of personColumns) {
      const value = row.values[column.def!.id];
      for (const token of Array.isArray(value) ? value : []) {
        if (token.includes("@")) emails.add(token.toLowerCase());
      }
    }
  }
  if (emails.size === 0) return;
  const members = await db.workspaceUser.findMany({
    where: { workspaceId, user: { email: { in: [...emails], mode: "insensitive" } } },
    select: { userId: true, user: { select: { email: true } } },
  });
  const idByEmail = new Map(members.map((m) => [m.user.email?.toLowerCase() ?? "", m.userId]));
  for (const row of preview.rows) {
    for (const column of personColumns) {
      const def = column.def!;
      const value = row.values[def.id];
      if (!Array.isArray(value)) continue;
      const resolved: string[] = [];
      let failed = false;
      for (const token of value) {
        if (!token.includes("@")) {
          resolved.push(token);
          continue;
        }
        const id = idByEmail.get(token.toLowerCase());
        if (!id) {
          row.errors.push({
            header: column.header,
            propertyName: def.name,
            reason: `names a person who is not in this workspace: "${token}"`,
          });
          failed = true;
          break;
        }
        resolved.push(id);
      }
      if (failed) delete row.values[def.id];
      else row.values[def.id] = [...new Set(resolved)];
    }
  }
  preview.importable = preview.rows.filter((r) => r.errors.length === 0).length;
}

/**
 * After the commit has given a select property its new options: the cells
 * that held an option's name now hold its id. `defs` are the written
 * definitions (existing properties updated, new columns minted) keyed by
 * the column's preview id.
 */
export function resolveOptionNames(
  defsByPreviewId: ReadonlyMap<string, PropertyDef>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    const def = defsByPreviewId.get(key);
    if (!def || (def.type !== "select" && def.type !== "multiSelect")) {
      out[key] = value;
      continue;
    }
    const toId = (v: unknown) => (typeof v === "string" ? (findOption(def, v)?.id ?? v) : v);
    out[key] = Array.isArray(value) ? value.map(toId) : toId(value);
  }
  return out;
}
