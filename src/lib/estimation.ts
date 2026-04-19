export const FIBONACCI_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "5", label: "5" },
  { value: "8", label: "8" },
  { value: "13", label: "13" },
];

export const TSHIRT_OPTIONS = [
  { value: "1", label: "XS" },
  { value: "2", label: "S" },
  { value: "3", label: "M" },
  { value: "5", label: "L" },
  { value: "8", label: "XL" },
];

export function getEffortOptions(scale: string) {
  return scale === "tshirt" ? TSHIRT_OPTIONS : FIBONACCI_OPTIONS;
}

export function getEffortLabel(scale: string, points: number | null | undefined): string {
  if (points == null) return "None";
  const options = getEffortOptions(scale);
  const match = options.find((o) => o.value === String(points));
  return match?.label ?? String(points);
}
