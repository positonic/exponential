import type { PropertyValue } from "./properties";
import type { PropertyDef } from "./schema";

/**
 * How a stored cell value reads on screen (the table block, the row header):
 * select ids become option names, lists join, a checkbox is Yes/No, a date is
 * its calendar day, a person id stays an id until the view resolves it.
 * Pure, shared by the client; the Markdown projection has its own
 * `cellMarkdown`, which must stay in step for the same types.
 */

export interface DisplayContext {
  /** A person's display name by user id. */
  personName?: (userId: string) => string | undefined;
}

export function optionName(def: PropertyDef, optionId: string): string {
  return def.options?.find((o) => o.id === optionId)?.name ?? optionId;
}

export function optionColor(def: PropertyDef, optionId: string): string | undefined {
  return def.options?.find((o) => o.id === optionId)?.color;
}

/** The day part of an ISO date, or the string as stored when it is not one. */
export function displayDate(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1]! : value;
}

/** A cell's text; empty string for an empty cell. */
export function displayValue(
  def: PropertyDef,
  value: PropertyValue | null | undefined,
  ctx: DisplayContext = {},
): string {
  if (value === null || value === undefined || value === "") return "";
  switch (def.type) {
    case "select":
      return optionName(def, String(value));
    case "multiSelect":
      return (Array.isArray(value) ? value : [String(value)])
        .map((id) => optionName(def, id))
        .join(", ");
    case "checkbox":
      return value ? "Yes" : "No";
    case "date":
      return displayDate(String(value));
    case "person":
    case "createdBy":
      return (Array.isArray(value) ? value : [String(value)])
        .map((id) => ctx.personName?.(id) ?? id)
        .join(", ");
    case "createdTime":
    case "lastEditedTime":
      return displayDate(String(value));
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

/** A row's value for a read-only property, taken from the row page itself. */
export function computedValue(
  def: PropertyDef,
  row: { createdAt: Date | string; updatedAt: Date | string; createdById: string },
): PropertyValue | null {
  switch (def.type) {
    case "createdTime":
      return new Date(row.createdAt).toISOString();
    case "lastEditedTime":
      return new Date(row.updatedAt).toISOString();
    case "createdBy":
      return [row.createdById];
    default:
      return null;
  }
}
