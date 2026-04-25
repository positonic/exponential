// These types match the Prisma enums defined in schema.prisma
export type EpicStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export const EPIC_STATUS_OPTIONS: { value: EpicStatus; label: string }[] = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

export type EpicPriority = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export const EPIC_PRIORITY_OPTIONS: { value: EpicPriority; label: string }[] = [
  { value: "HIGH", label: "High" },
  { value: "MEDIUM", label: "Medium" },
  { value: "LOW", label: "Low" },
  { value: "NONE", label: "None" },
];
