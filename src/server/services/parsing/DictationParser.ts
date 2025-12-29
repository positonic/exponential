import { parseDateFromText } from "./DateParser";
import { matchProjectInText } from "./ProjectMatcher";
import type { ParsedDictation, ProjectForMatching } from "./types";

/**
 * Parse dictated text to extract actionable information
 * Order: date extraction -> project matching -> name cleanup
 */
export function parseDictation(
  input: string,
  userProjects: ProjectForMatching[]
): ParsedDictation {
  const originalInput = input.trim();
  let workingText = originalInput;

  // Step 1: Extract and remove date references
  const dateResult = parseDateFromText(workingText);
  workingText = dateResult.cleanedText;

  // Step 2: Match and remove project references
  const projectResult = matchProjectInText(workingText, userProjects);
  workingText = projectResult.cleanedText;

  // Step 3: Final cleanup of the action name
  const cleanedName = cleanupActionName(workingText);

  return {
    cleanedName,
    originalInput,
    dueDate: dateResult.date,
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
  return (
    text
      // Remove common filler words that might be left over
      .replace(
        /^(?:please\s+|can\s+you\s+|i\s+need\s+to\s+|remind\s+me\s+to\s+)/i,
        ""
      )
      // Remove multiple spaces
      .replace(/\s+/g, " ")
      // Capitalize first letter
      .replace(/^./, (char) => char.toUpperCase())
      .trim()
  );
}
