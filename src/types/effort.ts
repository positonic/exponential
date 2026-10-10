// These types match the Prisma EffortUnit enum defined in schema.prisma
export type EffortUnit = "STORY_POINTS" | "T_SHIRT" | "HOURS";

export const EFFORT_UNIT_OPTIONS: { value: EffortUnit; label: string }[] = [
  { value: "STORY_POINTS", label: "Story Points" },
  { value: "T_SHIRT", label: "T-shirt Sizes" },
  { value: "HOURS", label: "Hours" },
];

export const STORY_POINT_OPTIONS = [1, 2, 3, 5, 8, 13, 21] as const;

export const T_SHIRT_OPTIONS = [
  { value: 1, label: "XS" },
  { value: 2, label: "S" },
  { value: 3, label: "M" },
  { value: 5, label: "L" },
  { value: 8, label: "XL" },
] as const;

export function effortToLabel(value: number | null | undefined, unit: EffortUnit): string {
  if (value == null) return "";
  if (unit === "T_SHIRT") {
    const match = T_SHIRT_OPTIONS.find((o) => o.value === value);
    return match?.label ?? String(value);
  }
  if (unit === "HOURS") return `${value}h`;
  return String(value); // story points
}

export const HOUR_OPTIONS = [1, 2, 4, 8, 16, 24, 40] as const;

export interface EffortOption {
  value: number;
  label: string;
}

/** The picker choices for a unit; the stored value is always the number. */
export function effortOptions(unit: EffortUnit): EffortOption[] {
  if (unit === "T_SHIRT") return T_SHIRT_OPTIONS.map((o) => ({ value: o.value, label: o.label }));
  if (unit === "HOURS") return HOUR_OPTIONS.map((h) => ({ value: h, label: `${h}h` }));
  return STORY_POINT_OPTIONS.map((p) => ({ value: p, label: String(p) }));
}

/** Form-field label for the unit ("Story points" / "Size" / "Hours"). */
export function effortFieldLabel(unit: EffortUnit): string {
  if (unit === "T_SHIRT") return "Size";
  if (unit === "HOURS") return "Hours";
  return "Story points";
}

/** Pill/chip text: "Effort" when unset, else "3 pts" / "M" / "8h". */
export function effortPillLabel(value: number | null | undefined, unit: EffortUnit): string {
  if (value == null) return "Effort";
  const label = effortToLabel(value, unit);
  return unit === "STORY_POINTS" ? `${label} pts` : label;
}
