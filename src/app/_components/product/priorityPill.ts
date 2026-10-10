/**
 * The in-place Priority pill shared by the product list tables (Backlog,
 * Features). Tickets and features use the same 0–4 scale as `PriorityIcon`
 * (0 Urgent … 3 Low, 4 No priority); the pill folds 4 and null into one
 * "None" choice, and picking it clears the field.
 */
import { PRIORITY_LABELS } from "./PriorityIcon";

export const PRIORITY_NONE = "none";

export const PRIORITY_PILL_OPTIONS = [
  { value: "0", label: PRIORITY_LABELS[0] ?? "Urgent" },
  { value: "1", label: PRIORITY_LABELS[1] ?? "High" },
  { value: "2", label: PRIORITY_LABELS[2] ?? "Medium" },
  { value: "3", label: PRIORITY_LABELS[3] ?? "Low" },
  { value: PRIORITY_NONE, label: "None" },
];

const PRIORITY_PILL_COLORS: Record<string, string> = {
  "0": "red",
  "1": "orange",
  "2": "yellow",
  "3": "blue",
  [PRIORITY_NONE]: "gray",
};

/** The pill value for a stored priority: 4 and null both read as "none". */
export function priorityPillValue(priority: number | null | undefined): string {
  return priority == null || priority === 4 ? PRIORITY_NONE : String(priority);
}

/** The stored priority for a picked pill value ("none" clears it). */
export function priorityFromPillValue(value: string): number | null {
  return value === PRIORITY_NONE ? null : Number(value);
}

export function priorityPillColor(priority: number | null | undefined): string {
  return PRIORITY_PILL_COLORS[priorityPillValue(priority)] ?? "gray";
}
