/**
 * Pure edits to a database's definition and saved view, shared by the
 * router and the lifecycle service so a column leaves the schema the same
 * way wherever it is removed.
 */
import type { DatabaseView, PropertyDef } from "~/lib/databases/schema";

/** The definition and view without `propertyId`: the column, and every mention of it in the view. */
export function withoutProperty(
  properties: readonly PropertyDef[],
  view: DatabaseView,
  propertyId: string,
): { properties: PropertyDef[]; view: DatabaseView } {
  return {
    properties: properties.filter((p) => p.id !== propertyId),
    view: {
      ...view,
      sort: view.sort?.propertyId === propertyId ? undefined : view.sort,
      filters: view.filters.filter((f) => f.propertyId !== propertyId),
      hiddenPropertyIds: view.hiddenPropertyIds.filter((id) => id !== propertyId),
      propertyOrder: view.propertyOrder.filter((id) => id !== propertyId),
    },
  };
}
