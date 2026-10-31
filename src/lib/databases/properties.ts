import {
  COMPUTED_PROPERTY_TYPES,
  type PropertyDef,
  type PropertyType,
} from "./schema";

/**
 * The property-type registry (ADR-0078 §5): for each type, how a raw value is
 * checked and normalised on write and how a stored value reads in Markdown.
 * Pure — no Prisma, no DOM — so the server validates with the same code the
 * table block uses for optimistic cell edits.
 *
 * A rejection names the reason in plain words; the router adds the property's
 * name and id, because the requirement is that the write is rejected *naming
 * the property*.
 */

/** A scalar value as stored in `KnowledgePage.properties`. */
export type PropertyValue = string | number | boolean | string[];

export type ValidationResult =
  | { ok: true; value: PropertyValue | null }
  | { ok: false; reason: string };

interface PropertyKind {
  /** Check and normalise a raw value; `null` means "clear the cell". */
  validate(def: PropertyDef, raw: unknown): ValidationResult;
  /** The cell's Markdown, for the page's projected table. */
  markdown(def: PropertyDef, value: PropertyValue): string;
}

function describe(raw: unknown): string {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return "a list";
  return typeof raw === "object" ? "an object" : `a ${typeof raw}`;
}

const text: PropertyKind = {
  validate(_def, raw) {
    if (typeof raw !== "string") {
      return { ok: false, reason: `expects text, got ${describe(raw)}` };
    }
    return { ok: true, value: raw };
  },
  markdown: (_def, value) => String(value),
};

/** Read-only types: the value comes from the row page, never from a write. */
const computed: PropertyKind = {
  validate: (def) => ({ ok: false, reason: `is read-only (${def.type})` }),
  markdown: (_def, value) => String(value),
};

/**
 * Types the next slice fills in. Until then a write to one is rejected
 * plainly rather than stored unchecked.
 */
const notYetWritable: PropertyKind = {
  validate: (def) => ({
    ok: false,
    reason: `of type ${def.type} cannot be written yet`,
  }),
  markdown: (_def, value) => String(value),
};

const REGISTRY: Record<PropertyType, PropertyKind> = {
  title: text,
  text,
  number: notYetWritable,
  select: notYetWritable,
  multiSelect: notYetWritable,
  date: notYetWritable,
  checkbox: notYetWritable,
  url: notYetWritable,
  person: notYetWritable,
  relation: notYetWritable,
  createdTime: computed,
  lastEditedTime: computed,
  createdBy: computed,
};

/**
 * Validate one raw value against its property. `null`, `undefined` and an
 * empty string all clear the cell, whatever the type.
 */
export function validateValue(def: PropertyDef, raw: unknown): ValidationResult {
  if (COMPUTED_PROPERTY_TYPES.has(def.type)) {
    return REGISTRY[def.type].validate(def, raw);
  }
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  return REGISTRY[def.type].validate(def, raw);
}

/** Escape what would break a GFM table cell: pipes and line breaks. */
export function escapeTableCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** The Markdown for one cell; an empty cell is the empty string. */
export function cellMarkdown(
  def: PropertyDef,
  value: PropertyValue | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  return escapeTableCell(REGISTRY[def.type].markdown(def, value));
}
