import Fuse, { type IFuseOptions } from "fuse.js";

import type { ProjectForMatching, ProjectMatchResult } from "./types";

// Regex patterns for project reference detection
// Order matters - more specific patterns first
const PROJECT_PATTERNS = [
  /for\s+(?:the\s+)?(.+?)\s+project\b/i, // "for the X project", "for X project"
  /add\s+(?:this\s+)?to\s+(?:the\s+)?(.+?)(?:\s+project)?\s*$/i, // "add to X", "add this to the X project"
  /on\s+(?:the\s+)?(.+?)\s+project\b/i, // "on the X project"
  /in\s+(?:the\s+)?(.+?)\s+project\b/i, // "in the X project"
  /(?:^|\s)(.+?)\s+project(?:\s|$)/i, // "X project" anywhere
];

// Fuse.js configuration optimized for short project names
const FUSE_OPTIONS: IFuseOptions<ProjectForMatching> = {
  keys: ["name"],
  threshold: 0.4, // 0.0 = exact match, 1.0 = match anything
  distance: 100, // How far to search for a match
  includeScore: true, // Return confidence scores
  minMatchCharLength: 2, // Minimum chars to match
  ignoreLocation: true, // Don't prioritize matches at beginning
};

/**
 * Find project reference in text and match against user's projects
 */
export function matchProjectInText(
  text: string,
  projects: ProjectForMatching[]
): ProjectMatchResult {
  if (projects.length === 0) {
    return {
      project: null,
      phrase: null,
      originalText: text,
      cleanedText: text,
    };
  }

  const fuse = new Fuse(projects, FUSE_OPTIONS);

  // Try each pattern to extract potential project name
  for (const pattern of PROJECT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const potentialProjectName = match[1].trim();

      // Skip very short or common words that might be false positives
      if (potentialProjectName.length < 2) continue;

      const fuseResults = fuse.search(potentialProjectName);

      const bestMatch = fuseResults[0];
      if (
        bestMatch &&
        bestMatch.score !== undefined &&
        bestMatch.score < 0.5
      ) {
        // Only accept if confidence is reasonable (score < 0.5)
        return {
          project: {
            id: bestMatch.item.id,
            name: bestMatch.item.name,
            score: bestMatch.score,
          },
          phrase: match[0],
          originalText: text,
          cleanedText: removeProjectPhrase(text, match[0]),
        };
      }
    }
  }

  return {
    project: null,
    phrase: null,
    originalText: text,
    cleanedText: text,
  };
}

/**
 * Remove the project reference phrase from text
 */
function removeProjectPhrase(text: string, phrase: string): string {
  return text
    .replace(phrase, "")
    .replace(/\s+/g, " ")
    .replace(/^\s*[,.\-]\s*/, "") // Remove leading punctuation
    .replace(/\s*[,.\-]\s*$/, "") // Remove trailing punctuation
    .trim();
}
