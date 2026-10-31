import { parseCsv, type ParsedCsv } from "~/lib/contactCsvImport";
import { validateValue, type PropertyValue } from "./properties";
import { ADDABLE_PROPERTY_TYPES, type PropertyDef, type PropertyType } from "./schema";

/**
 * CSV import into a database (ADR-0078, V4): a file's columns are mapped to
 * the database's properties — existing or new — and every cell is checked
 * by the property-type registry before any row exists. Pure, so the import
 * dialog previews with the same code the server commits with.
 *
 * Relation columns are not imported (the mapping refuses them); a relation
 * is set by hand or through the API after the rows exist.
 */

/** Where one CSV column lands. */
export type CsvColumnTarget =
  | { kind: "skip" }
  | { kind: "property"; propertyId: string }
  | { kind: "new"; name: string; type: PropertyType };

/** Column header (as in the file) → target. Headers the mapping leaves out are skipped. */
export type CsvMapping = Record<string, CsvColumnTarget>;

export { parseCsv, type ParsedCsv };

/** A cell the registry refused, with where it sits and why. */
export interface CsvCellError {
  /** The column header in the file. */
  header: string;
  propertyName: string;
  reason: string;
}

/** One file row, typed: its title, values keyed by property id (or new-column name), and what did not fit. */
export interface CsvPreviewRow {
  /** 0-based index among the file's data rows (the header line is not counted). */
  index: number;
  title: string | undefined;
  values: Record<string, PropertyValue | null>;
  errors: CsvCellError[];
}

/** A column as the preview resolves it: what it maps to and the definition cells are checked against. */
export interface CsvPreviewColumn {
  header: string;
  target: CsvColumnTarget;
  /** The property the cells are checked against; absent for a skipped column. */
  def?: PropertyDef;
}

export interface CsvPreview {
  columns: CsvPreviewColumn[];
  rows: CsvPreviewRow[];
  /** Rows with no cell error — the ones a commit would create. */
  importable: number;
}

/** Types a new column may be given from a CSV: the addable scalars (never title or relation). */
export const CSV_NEW_COLUMN_TYPES: readonly PropertyType[] = ADDABLE_PROPERTY_TYPES.filter(
  (type) => type !== "createdTime" && type !== "lastEditedTime" && type !== "createdBy",
);

/** The property a header names, by name (case-insensitive, trimmed) then by id. */
function matchProperty(properties: readonly PropertyDef[], header: string): PropertyDef | undefined {
  const wanted = header.trim().toLowerCase();
  return (
    properties.find((p) => p.name.trim().toLowerCase() === wanted) ?? properties.find((p) => p.id === header)
  );
}

/**
 * A first mapping for a file: a header that names a property maps to it
 * (never a relation or a read-only property, which are skipped); the rest
 * become new text columns. The first unmapped header becomes the title
 * when no header names it — a row needs one.
 */
export function suggestCsvMapping(properties: readonly PropertyDef[], headers: readonly string[]): CsvMapping {
  const mapping: CsvMapping = {};
  const taken = new Set<string>();
  for (const header of headers) {
    const def = matchProperty(properties, header);
    if (def && !taken.has(def.id)) {
      taken.add(def.id);
      mapping[header] =
        def.type === "relation" || def.type === "createdTime" || def.type === "lastEditedTime" || def.type === "createdBy"
          ? { kind: "skip" }
          : { kind: "property", propertyId: def.id };
    } else {
      mapping[header] = header.trim() ? { kind: "new", name: header.trim(), type: "text" } : { kind: "skip" };
    }
  }
  const title = properties.find((p) => p.type === "title");
  if (title && !taken.has(title.id)) {
    const first = headers.find((h) => mapping[h]?.kind === "new");
    if (first) mapping[first] = { kind: "property", propertyId: title.id };
  }
  return mapping;
}

/** A mapping error: the import refuses the whole file rather than guessing. */
export class CsvMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvMappingError";
  }
}

/**
 * Resolve a mapping against the file and the schema. Throws
 * {@link CsvMappingError} when a header is not in the file, a property is
 * not in the database or cannot take a cell (relation, read-only), a new
 * column's name clashes, or two columns target the same property.
 */
export function resolveCsvColumns(
  properties: readonly PropertyDef[],
  headers: readonly string[],
  mapping: CsvMapping,
): CsvPreviewColumn[] {
  const columns: CsvPreviewColumn[] = [];
  const targeted = new Set<string>();
  const names = new Set(properties.map((p) => p.name.trim().toLowerCase()));
  for (const header of Object.keys(mapping)) {
    if (!headers.includes(header)) throw new CsvMappingError(`The file has no column "${header}"`);
  }
  for (const header of headers) {
    const target = mapping[header] ?? { kind: "skip" };
    if (target.kind === "skip") {
      columns.push({ header, target });
      continue;
    }
    if (target.kind === "property") {
      const def = properties.find((p) => p.id === target.propertyId);
      if (!def) throw new CsvMappingError(`Column "${header}" maps to a property this database does not have`);
      if (def.type === "relation" || def.type === "createdTime" || def.type === "lastEditedTime" || def.type === "createdBy") {
        throw new CsvMappingError(`Column "${header}" maps to "${def.name}", which cannot be imported (${def.type})`);
      }
      if (targeted.has(def.id)) throw new CsvMappingError(`Two columns map to "${def.name}"`);
      targeted.add(def.id);
      columns.push({ header, target, def });
      continue;
    }
    const name = target.name.trim();
    if (!name) throw new CsvMappingError(`Column "${header}" needs a name for its new property`);
    if (!CSV_NEW_COLUMN_TYPES.includes(target.type)) {
      throw new CsvMappingError(`Column "${header}" cannot create a ${target.type} property`);
    }
    const key = name.toLowerCase();
    if (names.has(key)) throw new CsvMappingError(`A property named "${name}" already exists; map the column to it`);
    names.add(key);
    // A new column is checked against the definition it will get; its id is
    // its name until the commit mints one.
    columns.push({ header, target, def: { id: `new:${name}`, name, type: target.type, ...(target.type === "select" || target.type === "multiSelect" ? { options: [] } : {}) } });
  }
  return columns;
}

/**
 * One cell as the registry reads it. An empty cell clears. A select or
 * multi-select value that names no option is accepted as its name — the
 * commit creates the option (V4 action 2 widens this per type).
 */
export function parseCsvCell(def: PropertyDef, text: string): ReturnType<typeof validateValue> {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  return validateValue(def, trimmed);
}

/**
 * Type every row of the file through the resolved columns. Never throws
 * for a cell: a cell that does not fit is an error on its row, and the
 * row is left for the user to fix or drop.
 */
export function previewCsvRows(columns: readonly CsvPreviewColumn[], parsed: ParsedCsv): CsvPreview {
  const indexOf = new Map(parsed.headers.map((h, i) => [h, i]));
  const rows: CsvPreviewRow[] = parsed.rows.map((cells, index) => {
    const values: Record<string, PropertyValue | null> = {};
    const errors: CsvCellError[] = [];
    let title: string | undefined;
    for (const column of columns) {
      if (!column.def) continue;
      const text = cells[indexOf.get(column.header) ?? -1] ?? "";
      const result = parseCsvCell(column.def, text);
      if (!result.ok) {
        errors.push({ header: column.header, propertyName: column.def.name, reason: result.reason });
        continue;
      }
      if (column.def.type === "title") title = typeof result.value === "string" ? result.value : "";
      else values[column.def.id] = result.value;
    }
    return { index, title, values, errors };
  });
  return { columns: [...columns], rows, importable: rows.filter((r) => r.errors.length === 0).length };
}
