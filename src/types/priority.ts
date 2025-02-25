export const PRIORITY_VALUES = [
  "Quick",
  "Scheduled",
  "1st Priority",
  "2nd Priority",
  "3rd Priority",
  "4th Priority",
  "5th Priority",
  "Errand",
  "Remember",
  "Watch",
  "Someday Maybe"
] as const;

export type Priority = typeof PRIORITY_VALUES[number]; 