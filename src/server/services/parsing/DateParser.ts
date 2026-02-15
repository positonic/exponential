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
      dateType: null,
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
      dateType: null,
      phrase: null,
      originalText: text,
      cleanedText: text,
    };
  }
  const extractedDate = result.start.date();
  const extractedPhrase = result.text;

  // Determine if this is a deadline ("by Friday", "before Monday", "due tomorrow")
  // or a schedule date ("tomorrow", "on Friday", "next week")
  const dateType = isDeadlinePhrase(text, extractedPhrase)
    ? "deadline"
    : "schedule";

  // Remove the date phrase from the text
  const cleanedText = removePhrase(text, extractedPhrase);

  return {
    date: extractedDate,
    dateType,
    phrase: extractedPhrase,
    originalText: text,
    cleanedText: cleanedText.trim(),
  };
}

/**
 * Check if the date phrase is preceded by deadline indicators (by, before, until, due)
 */
function isDeadlinePhrase(fullText: string, phrase: string): boolean {
  const lowerText = fullText.toLowerCase();
  const phraseIndex = lowerText.indexOf(phrase.toLowerCase());
  if (phraseIndex < 0) return false;

  // Check the text immediately before the date phrase for deadline keywords
  const prefixText = lowerText.substring(
    Math.max(0, phraseIndex - 10),
    phraseIndex
  );
  return /\b(?:by|before|until|due)\s*$/.test(prefixText);
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
