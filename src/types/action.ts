import { type Priority } from "~/types/priority";

export type { Priority };

// Alias kept for legacy callers (Mantine modal forms).
export type ActionPriority = Priority;

// UI dropdown options for action priority.
// Same Priority union as PRIORITY_VALUES, but excludes "Someday Maybe"
// to preserve the existing dropdown order/contents in the modals.
export const PRIORITY_OPTIONS: Priority[] = [
  "1st Priority",
  "2nd Priority",
  "3rd Priority",
  "4th Priority",
  "5th Priority",
  "Quick",
  "Scheduled",
  "Errand",
  "Remember",
  "Watch",
];
