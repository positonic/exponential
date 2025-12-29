// NOTE: chrono-node temporarily disabled to test build performance
// import { parse as chronoParse } from "chrono-node";

import type { DateExtractionResult } from "./types";

/**
 * Extract date from natural language text
 * TODO: Re-enable chrono-node once build performance is resolved
 */
export function parseDateFromText(
  text: string,
  _referenceDate?: Date
): DateExtractionResult {
  // Temporarily disabled - return text unchanged
  return {
    date: null,
    phrase: null,
    originalText: text,
    cleanedText: text,
  };
}
