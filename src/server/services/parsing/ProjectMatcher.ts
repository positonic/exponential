import Fuse, { type IFuseOptions } from "fuse.js";

import type { ProjectForMatching } from "./types";

export interface ProjectMatchResult {
  project: { id: string; name: string; score: number } | null;
  phrase: string | null;
  cleanedText: string;
}

// Patterns to detect project references in text
const PROJECT_PATTERNS = [
  /\bfor\s+(?:the\s+)?([^,.\n]+?)\s+project\b/i,
  /\badd\s+(?:this\s+)?to\s+([^,.\n]+?)(?:\s+project)?\b/i,
  /\bon\s+(?:the\s+)?([^,.\n]+?)\s+project\b/i,
  /\b([^,.\n]+?)\s+project\b/i,
];

/**
 * Match a project reference in text using fuzzy search
 */
export function matchProject(
  text: string,
  projects: ProjectForMatching[]
): ProjectMatchResult {
  if (projects.length === 0) {
    return { project: null, phrase: null, cleanedText: text };
  }

  // Try each pattern to find a project reference
  for (const pattern of PROJECT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const projectPhrase = match[1].trim();
      const fullMatch = match[0];

      // Use fuse.js for fuzzy matching
      const fuseOptions: IFuseOptions<ProjectForMatching> = {
        keys: ["name"],
        threshold: 0.4, // Lower = stricter matching
        includeScore: true,
      };

      const fuse = new Fuse(projects, fuseOptions);
      const results = fuse.search(projectPhrase);

      if (results.length > 0 && results[0]) {
        const bestMatch = results[0];
        const score = bestMatch.score ?? 0;

        // Only accept if score is good enough (lower is better in fuse.js)
        if (score <= 0.5) {
          const cleanedText = removePhrase(text, fullMatch);
          return {
            project: {
              id: bestMatch.item.id,
              name: bestMatch.item.name,
              score: 1 - score, // Convert to 0-1 where higher is better
            },
            phrase: fullMatch,
            cleanedText,
          };
        }
      }
    }
  }

  return { project: null, phrase: null, cleanedText: text };
}

/**
 * Remove a phrase from text, handling surrounding whitespace
 */
function removePhrase(text: string, phrase: string): string {
  const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\s*${escapedPhrase}\\s*`, "gi");
  return text
    .replace(pattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}
