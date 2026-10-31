import {
  COMPUTED_PROPERTY_TYPES,
  type PropertyDef,
  type PropertyType,
  type SelectOption,
} from "./schema";

/**
 * The property-type registry (ADR-0078 §5): for each type, how a raw value is
 * checked and normalised on write and how a stored value reads in Markdown.
 * Pure — no Prisma, no DOM — so the server validates with the same code the
 * table block uses for optimistic cell edits.
 *
 * Stored forms: `title`/`text`/`url` a string; `number` a number; `select` an
 * option id; `multiSelect` option ids; `date` an ISO 8601 string (a bare
 * `YYYY-MM-DD` stays a date, anything with a time becomes a UTC instant);
 * `checkbox` a boolean; `person` user ids. Select values are ids so renaming
 * an option never rewrites a row.
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

/** What the Markdown projection may look up while rendering a cell. */
export interface CellContext {
  /** A person's display name by user id; the id itself is shown when absent. */
  personName?: (userId: string) => string | undefined;
  /** A relation target's title (and link) by property and target id; the id is shown when absent. */
  relationTarget?: (def: PropertyDef, targetId: string) => { title: string; href?: string } | undefined;
}

interface PropertyKind {
  /** Check and normalise a raw value; `null` means "clear the cell". */
  validate(def: PropertyDef, raw: unknown): ValidationResult;
  /** The cell's Markdown, for the page's projected table. */
  markdown(def: PropertyDef, value: PropertyValue, ctx: CellContext): string;
}

function describe(raw: unknown): string {
  if (raw === null) return "null";
  if (Array.isArray(raw)) return "a list";
  return typeof raw === "object" ? "an object" : `a ${typeof raw}`;
}

function reject(reason: string): ValidationResult {
  return { ok: false, reason };
}

function accept(value: PropertyValue | null): ValidationResult {
  return { ok: true, value };
}

/** One option by id, then by name (case-insensitive, trimmed). */
export function findOption(def: PropertyDef, key: string): SelectOption | undefined {
  const options = def.options ?? [];
  const byId = options.find((o) => o.id === key);
  if (byId) return byId;
  const wanted = key.trim().toLowerCase();
  return options.find((o) => o.name.trim().toLowerCase() === wanted);
}

function optionNames(def: PropertyDef): string {
  const names = (def.options ?? []).map((o) => o.name);
  return names.length ? names.join(", ") : "(no options yet)";
}

function optionName(def: PropertyDef, id: string): string {
  return (def.options ?? []).find((o) => o.id === id)?.name ?? id;
}

/** A list value may arrive as an array or as a comma-separated string (the CLI). */
function asList(raw: unknown): string[] | null {
  if (Array.isArray(raw)) {
    return raw.every((item) => typeof item === "string") ? raw : null;
  }
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return null;
}

const text: PropertyKind = {
  validate(_def, raw) {
    if (typeof raw !== "string") return reject(`expects text, got ${describe(raw)}`);
    return accept(raw);
  },
  markdown: (_def, value) => String(value),
};

const number: PropertyKind = {
  validate(_def, raw) {
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? accept(raw) : reject("expects a finite number");
    }
    if (typeof raw === "string") {
      const parsed = Number(raw.trim());
      if (raw.trim() !== "" && Number.isFinite(parsed)) return accept(parsed);
      return reject(`expects a number, got "${raw}"`);
    }
    return reject(`expects a number, got ${describe(raw)}`);
  },
  markdown: (_def, value) => String(value),
};

const select: PropertyKind = {
  validate(def, raw) {
    if (typeof raw !== "string") return reject(`expects an option name, got ${describe(raw)}`);
    const option = findOption(def, raw);
    if (!option) return reject(`has no option "${raw}"; expects one of: ${optionNames(def)}`);
    return accept(option.id);
  },
  markdown: (def, value) => optionName(def, String(value)),
};

const multiSelect: PropertyKind = {
  validate(def, raw) {
    const items = asList(raw);
    if (!items) return reject(`expects a list of option names, got ${describe(raw)}`);
    const ids: string[] = [];
    for (const item of items) {
      const option = findOption(def, item);
      if (!option) return reject(`has no option "${item}"; expects any of: ${optionNames(def)}`);
      if (!ids.includes(option.id)) ids.push(option.id);
    }
    return accept(ids);
  },
  markdown: (def, value) =>
    (Array.isArray(value) ? value : [String(value)]).map((id) => optionName(def, id)).join(", "),
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const date: PropertyKind = {
  validate(_def, raw) {
    if (raw instanceof Date) {
      return Number.isNaN(raw.getTime()) ? reject("expects a valid date") : accept(raw.toISOString());
    }
    if (typeof raw !== "string") return reject(`expects an ISO date, got ${describe(raw)}`);
    const trimmed = raw.trim();
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return reject(`expects an ISO date, got "${raw}"`);
    // A bare day stays a day; anything with a time is normalised to UTC.
    return accept(DATE_ONLY.test(trimmed) ? trimmed : parsed.toISOString());
  },
  markdown: (_def, value) => String(value),
};

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "on", "checked"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "off", "unchecked"]);

const checkbox: PropertyKind = {
  validate(_def, raw) {
    if (typeof raw === "boolean") return accept(raw);
    if (typeof raw === "string") {
      const word = raw.trim().toLowerCase();
      if (TRUE_WORDS.has(word)) return accept(true);
      if (FALSE_WORDS.has(word)) return accept(false);
      return reject(`expects true or false, got "${raw}"`);
    }
    return reject(`expects true or false, got ${describe(raw)}`);
  },
  markdown: (_def, value) => (value ? "Yes" : "No"),
};

const SAFE_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

const url: PropertyKind = {
  validate(_def, raw) {
    if (typeof raw !== "string") return reject(`expects a URL, got ${describe(raw)}`);
    const trimmed = raw.trim();
    try {
      const parsed = new URL(trimmed);
      if (!SAFE_URL_PROTOCOLS.has(parsed.protocol)) {
        return reject(`expects an http, https or mailto URL, got "${raw}"`);
      }
      return accept(trimmed);
    } catch {
      return reject(`expects a URL, got "${raw}"`);
    }
  },
  markdown: (_def, value) => String(value),
};

const person: PropertyKind = {
  validate(_def, raw) {
    const ids = asList(raw);
    if (!ids) return reject(`expects a user id or a list of them, got ${describe(raw)}`);
    const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
    return accept(unique);
  },
  markdown: (_def, value, ctx) =>
    (Array.isArray(value) ? value : [String(value)])
      .map((id) => ctx.personName?.(id) ?? id)
      .join(", "),
};

/**
 * A relation cell takes the ids of its targets (a list, or comma-separated
 * from the CLI). They are never stored as a value: the router turns them
 * into edges (ADR-0078 §3), and the projection reads the edges back.
 */
const relation: PropertyKind = {
  validate(_def, raw) {
    const ids = asList(raw);
    if (!ids) return reject(`expects a target id or a list of them, got ${describe(raw)}`);
    return accept([...new Set(ids.map((id) => id.trim()).filter(Boolean))]);
  },
  markdown: (def, value, ctx) =>
    (Array.isArray(value) ? value : [String(value)])
      .map((id) => {
        const target = ctx.relationTarget?.(def, id);
        if (!target) return id;
        const title = target.title.replace(/([[\]])/g, "\\$1");
        return target.href ? `[${title}](${target.href})` : title;
      })
      .join(", "),
};

/** Read-only types: the value comes from the row page, never from a write. */
const computed: PropertyKind = {
  validate: (def) => reject(`is read-only (${def.type})`),
  markdown: (_def, value) => String(value),
};

const REGISTRY: Record<PropertyType, PropertyKind> = {
  title: text,
  text,
  number,
  select,
  multiSelect,
  date,
  checkbox,
  url,
  person,
  relation,
  createdTime: computed,
  lastEditedTime: computed,
  // Read-only like the times, but it names a person, so it reads like one.
  createdBy: {
    validate: (def, raw) => computed.validate(def, raw),
    markdown: (def, value, ctx) => person.markdown(def, value, ctx),
  },
};

/**
 * Validate one raw value against its property. `null`, `undefined` and an
 * empty string all clear the cell, whatever the type — except on read-only
 * properties, which take no cell value at all.
 */
export function validateValue(def: PropertyDef, raw: unknown): ValidationResult {
  if (COMPUTED_PROPERTY_TYPES.has(def.type)) {
    return REGISTRY[def.type].validate(def, raw);
  }
  if (raw === null || raw === undefined || raw === "") {
    return accept(null);
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
  ctx: CellContext = {},
): string {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) && value.length === 0) return "";
  return escapeTableCell(REGISTRY[def.type].markdown(def, value, ctx));
}
