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
