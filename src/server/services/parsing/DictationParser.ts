import { parseDateFromText } from "./DateParser";
import { matchProject } from "./ProjectMatcher";
import type { ParsedDictation, ProjectForMatching } from "./types";

/**
 * Parse dictated text to extract actionable information
 * Handles date extraction and project matching
 */
export function parseDictation(
  input: string,
  projects: ProjectForMatching[] = []
): ParsedDictation {
  const originalInput = input.trim();

  // Step 1: Extract and remove date references
  const dateResult = parseDateFromText(originalInput);

  // Step 2: Extract and remove project references
  const projectResult = matchProject(dateResult.cleanedText, projects);

  // Step 3: Clean up the action name
  const cleanedName = cleanupActionName(projectResult.cleanedText);

  return {
    cleanedName,
    originalInput,
    scheduledStart:
      dateResult.dateType === "schedule" ? dateResult.date : null,
    dueDate: dateResult.dateType === "deadline" ? dateResult.date : null,
    matchedProject: projectResult.project,
    extractionDetails: {
      datePhrase: dateResult.phrase,
      projectPhrase: projectResult.phrase,
    },
  };
}

/**
 * Clean up the action name after extraction
 */
function cleanupActionName(text: string): string {
  return text
    .replace(
      /^(?:please\s+|can\s+you\s+|i\s+need\s+to\s+|remind\s+me\s+to\s+)/i,
      ""
    )
    .replace(/\s+/g, " ")
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}
