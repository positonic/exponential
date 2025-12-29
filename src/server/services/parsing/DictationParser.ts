import { parseDateFromText } from "./DateParser";
import type { ParsedDictation } from "./types";

/**
 * Parse dictated text to extract actionable information
 * Currently only handles date extraction
 */
export function parseDictation(input: string): ParsedDictation {
  const originalInput = input.trim();

  // Step 1: Extract and remove date references
  const dateResult = parseDateFromText(originalInput);

  // Step 2: Clean up the action name
  const cleanedName = cleanupActionName(dateResult.cleanedText);

  return {
    cleanedName,
    originalInput,
    dueDate: dateResult.date,
    extractionDetails: {
      datePhrase: dateResult.phrase,
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
