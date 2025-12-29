// NOTE: fuse.js temporarily disabled to test build performance
// import Fuse, { type IFuseOptions } from "fuse.js";

import type { ProjectForMatching, ProjectMatchResult } from "./types";

/**
 * Find project reference in text and match against user's projects
 * TODO: Re-enable fuse.js once build performance is resolved
 */
export function matchProjectInText(
  text: string,
  _projects: ProjectForMatching[]
): ProjectMatchResult {
  // Temporarily disabled - return text unchanged
  return {
    project: null,
    phrase: null,
    originalText: text,
    cleanedText: text,
  };
}
