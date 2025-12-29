import { parse as chronoParse } from "chrono-node";

import type { DateExtractionResult } from "./types";

/**
 * Extract date from natural language text using chrono-node
 * Returns the parsed date and the text with the date phrase removed
 */
export function parseDateFromText(
  text: string,
  referenceDate?: Date
): DateExtractionResult {
  const ref = referenceDate ?? new Date();

  // Parse with chrono-node (forwardDate ensures "Monday" means next Monday, not last)
  const parsed = chronoParse(text, ref, { forwardDate: true });

  if (parsed.length === 0) {
    return {
      date: null,
      phrase: null,
      originalText: text,
      cleanedText: text,
    };
  }

  // Take the first (most prominent) date reference
  const result = parsed[0];
  if (!result) {
    return {
      date: null,
      phrase: null,
      originalText: text,
      cleanedText: text,
    };
  }
  const extractedDate = result.start.date();
  const extractedPhrase = result.text;

  // Remove the date phrase from the text
  const cleanedText = removePhrase(text, extractedPhrase);

  return {
    date: extractedDate,
    phrase: extractedPhrase,
    originalText: text,
    cleanedText: cleanedText.trim(),
  };
}

/**
 * Remove a phrase from text, handling surrounding punctuation/whitespace
 */
function removePhrase(text: string, phrase: string): string {
  const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\s*(?:due\\s+)?${escapedPhrase}\\s*`, "gi");
  return text
    .replace(pattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}
