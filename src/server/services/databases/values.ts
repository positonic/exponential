/**
 * Turning a caller's `{ property: value }` map into a Row's stored values
 * (ADR-0078 §7). Keys may be property ids (the table block) or names (the CLI's
 * `--set Status=Tracked`); every value is checked by the property-type
 * registry, and a value that does not fit is rejected **naming the property**
 * — the shape the tRPC error formatter forwards as `data.property`.
 */
import { validateValue, type PropertyValue } from "~/lib/databases/properties";
import { findProperty, type PropertyDef } from "~/lib/databases/schema";

export interface PropertyRejection {
  /** Null when the caller named a property that does not exist. */
  propertyId: string | null;
  propertyName: string;
  reason: string;
}

export class PropertyValueError extends Error {
  constructor(public readonly rejection: PropertyRejection) {
    super(`Property "${rejection.propertyName}" ${rejection.reason}`);
    this.name = "PropertyValueError";
  }
}

/** The structured rejection on an error's cause, for the tRPC `errorFormatter`. */
export function propertyRejectionFromError(error: unknown): PropertyRejection | null {
  if (error instanceof PropertyValueError) return error.rejection;
  const cause = error instanceof Error ? error.cause : undefined;
  return cause instanceof PropertyValueError ? cause.rejection : null;
}

export interface CoercedRowValues {
  /** Scalar values keyed by property id, ready for `KnowledgePage.properties`. */
  values: Record<string, PropertyValue | null>;
  /** The title property's value, when the caller set it; it is the row page's title. */
  title: string | undefined;
  /** Relation targets by property id — edges to write, never values (ADR-0078 §3); empty clears. */
  relations: Record<string, string[]>;
}

/**
 * Resolve and validate every entry. Throws {@link PropertyValueError} on the
 * first entry that names no property or carries a value of the wrong type.
 * The title property is returned apart — it lives on `KnowledgePage.title`,
 * not in the values column.
 */
export function coerceRowValues(
  properties: readonly PropertyDef[],
  raw: Record<string, unknown>,
): CoercedRowValues {
  const values: Record<string, PropertyValue | null> = {};
  const relations: Record<string, string[]> = {};
  let title: string | undefined;
  for (const [key, rawValue] of Object.entries(raw)) {
    const def = findProperty(properties, key);
    if (!def) {
      throw new PropertyValueError({
        propertyId: null,
        propertyName: key,
        reason: "does not exist on this database",
      });
    }
    const result = validateValue(def, rawValue);
    if (!result.ok) {
      throw new PropertyValueError({
        propertyId: def.id,
        propertyName: def.name,
        reason: result.reason,
      });
    }
    if (def.type === "title") {
      title = typeof result.value === "string" ? result.value : "";
    } else if (def.type === "relation") {
      relations[def.id] = Array.isArray(result.value) ? result.value : [];
    } else {
      values[def.id] = result.value;
    }
  }
  return { values, title, relations };
}
