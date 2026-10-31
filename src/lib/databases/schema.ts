import { z } from "zod";

/**
 * The shape of a Database's schema and saved view (ADR-0078), as stored in
 * `PageDatabase.properties` and `PageDatabase.view`. Shared by the server
 * (validation, the row query compiler, the Markdown projection) and the client
 * (the table block), so the two can never disagree on what a property is.
 *
 * Ids — of properties and of select options — are minted once and never
 * reused. Rows key their values by property id, so renaming a property or an
 * option touches only these definitions, never a row.
 */

export const PROPERTY_TYPES = [
  "title",
  "text",
  "number",
  "select",
  "multiSelect",
  "date",
  "checkbox",
  "url",
  "person",
  "relation",
  "createdTime",
  "lastEditedTime",
  "createdBy",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const propertyTypeSchema = z.enum(PROPERTY_TYPES);

/** Derived from the row page itself (`createdAt`, `updatedAt`, `createdById`); never written. */
export const COMPUTED_PROPERTY_TYPES: ReadonlySet<PropertyType> = new Set<PropertyType>([
  "createdTime",
  "lastEditedTime",
  "createdBy",
]);

/**
 * Select-option colours are Mantine palette names, resolved through the list
 * pages' `pillTint` — never hex — so a theme change restyles every database.
 */
export const PILL_COLORS = [
  "gray",
  "red",
  "pink",
  "grape",
  "violet",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "green",
  "lime",
  "yellow",
  "orange",
] as const;
export type PillColor = (typeof PILL_COLORS)[number];
export const pillColorSchema = z.enum(PILL_COLORS);

export const RELATION_TARGET_KINDS = [
  "ROW",
  "TICKET",
  "PROJECT",
  "FEATURE",
  "GOAL",
  "KEY_RESULT",
  "PAGE",
] as const;
export type RelationTargetKind = (typeof RELATION_TARGET_KINDS)[number];
export const relationTargetKindSchema = z.enum(RELATION_TARGET_KINDS);

export const selectOptionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  color: pillColorSchema,
});
export type SelectOption = z.infer<typeof selectOptionSchema>;

export const relationConfigSchema = z.object({
  targetKind: relationTargetKindSchema,
  /** The other database, for `ROW` targets only. */
  targetDatabaseId: z.string().optional(),
  /** Set on the auto-created reverse column of a two-way database relation. */
  inverseOf: z
    .object({ databaseId: z.string(), propertyId: z.string() })
    .optional(),
  many: z.boolean(),
});
export type RelationConfig = z.infer<typeof relationConfigSchema>;

export const propertyDefSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  type: propertyTypeSchema,
  description: z.string().trim().max(2000).optional(),
  /** `select` / `multiSelect` only. */
  options: selectOptionSchema.array().optional(),
  /** `relation` only. */
  relation: relationConfigSchema.optional(),
});
export type PropertyDef = z.infer<typeof propertyDefSchema>;

export const FILTER_OPS = [
  "eq",
  "neq",
  "contains",
  "isEmpty",
  "isNotEmpty",
  "gt",
  "lt",
  "before",
  "after",
  "anyOf",
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];
export const filterOpSchema = z.enum(FILTER_OPS);

export const filterSchema = z.object({
  propertyId: z.string().min(1),
  op: filterOpSchema,
  value: z.unknown().optional(),
});
export type Filter = z.infer<typeof filterSchema>;

/** The one table view saved on the block (ADR-0078 §6). */
export const databaseViewSchema = z.object({
  sort: z
    .object({
      propertyId: z.string().min(1),
      direction: z.enum(["asc", "desc"]),
    })
    .optional(),
  filters: filterSchema.array().default([]),
  hiddenPropertyIds: z.string().array().default([]),
  /** Column order by property id; properties missing here follow in definition order. */
  propertyOrder: z.string().array().default([]),
});
export type DatabaseView = z.infer<typeof databaseViewSchema>;

/** Stored JSON → property definitions. Throws on a malformed column; the write path never stores one. */
export function parseProperties(json: unknown): PropertyDef[] {
  return propertyDefSchema.array().parse(json);
}

/** Stored JSON → view. A null/legacy column reads as the empty view. */
export function parseView(json: unknown): DatabaseView {
  return databaseViewSchema.parse(json ?? {});
}

export function emptyView(propertyOrder: string[] = []): DatabaseView {
  return { filters: [], hiddenPropertyIds: [], propertyOrder };
}

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_LENGTH = 12;

/**
 * A fresh property / option id. Lowercase alphanumeric so it is safe inside a
 * Markdown marker, a CLI flag and a JSON path alike. Uses the platform CSPRNG
 * (browser and Node both expose `globalThis.crypto`).
 */
export function newPropertyId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

/** Select options use the same id shape as properties. */
export const newOptionId = newPropertyId;

/** The property every new database starts with; its value is the row page's title. */
export function defaultTitleProperty(): PropertyDef {
  return { id: newPropertyId(), name: "Name", type: "title" };
}

/**
 * The types a caller may add, or change a property to. `title` exists once
 * per database from creation; `relation` is added through its own path (V3).
 */
export const ADDABLE_PROPERTY_TYPES: readonly PropertyType[] = PROPERTY_TYPES.filter(
  (type) => type !== "title" && type !== "relation",
);

/** Types that carry select options. */
export function hasOptions(type: PropertyType): boolean {
  return type === "select" || type === "multiSelect";
}

/**
 * Give every option an id and a colour. Options arriving with an id keep it
 * (a rename or recolour); new ones are minted, cycling through the palette
 * after the ones already taken. Names must be unique within the property.
 */
export function normaliseOptions(
  input: readonly { id?: string; name: string; color?: PillColor }[],
  existing: readonly SelectOption[] = [],
): { options: SelectOption[]; duplicateName?: string } {
  const byId = new Map(existing.map((o) => [o.id, o]));
  const seen = new Set<string>();
  const options: SelectOption[] = [];
  let paletteCursor = existing.length;
  for (const raw of input) {
    const name = raw.name.trim();
    const key = name.toLowerCase();
    if (seen.has(key)) return { options: [], duplicateName: name };
    seen.add(key);
    const current = raw.id ? byId.get(raw.id) : undefined;
    const color =
      raw.color ?? current?.color ?? PILL_COLORS[paletteCursor++ % PILL_COLORS.length]!;
    options.push({ id: current?.id ?? newOptionId(), name, color });
  }
  return { options };
}

/**
 * The property a caller named — by id first, then by name (case-insensitive,
 * trimmed). The CLI's `--set Status=Tracked` arrives as a name; the table
 * block sends ids. Undefined when nothing matches or the name is ambiguous.
 */
export function findProperty(
  properties: readonly PropertyDef[],
  key: string,
): PropertyDef | undefined {
  const byId = properties.find((p) => p.id === key);
  if (byId) return byId;
  const wanted = key.trim().toLowerCase();
  const byName = properties.filter((p) => p.name.trim().toLowerCase() === wanted);
  return byName.length === 1 ? byName[0] : undefined;
}

/**
 * The first property id a view mentions that the database does not have, or
 * null when every reference resolves. A view is saved whole, so one stale id
 * rejects the whole write rather than being silently dropped.
 */
export function unknownPropertyInView(
  properties: readonly PropertyDef[],
  view: DatabaseView,
): string | null {
  const known = new Set(properties.map((p) => p.id));
  const referenced = [
    ...(view.sort ? [view.sort.propertyId] : []),
    ...view.filters.map((f) => f.propertyId),
    ...view.hiddenPropertyIds,
    ...view.propertyOrder,
  ];
  return referenced.find((id) => !known.has(id)) ?? null;
}

/**
 * The columns a table shows, in display order: `view.propertyOrder` first,
 * then any property it does not mention in definition order, minus the hidden
 * ones. Ids in the view that no longer exist are ignored.
 */
export function visibleProperties(
  properties: readonly PropertyDef[],
  view: DatabaseView,
): PropertyDef[] {
  const byId = new Map(properties.map((p) => [p.id, p]));
  const hidden = new Set(view.hiddenPropertyIds);
  const ordered: PropertyDef[] = [];
  const seen = new Set<string>();
  for (const id of view.propertyOrder) {
    const def = byId.get(id);
    if (def && !seen.has(id)) {
      ordered.push(def);
      seen.add(id);
    }
  }
  for (const def of properties) {
    if (!seen.has(def.id)) ordered.push(def);
  }
  return ordered.filter((def) => !hidden.has(def.id));
}
