export interface ParsedDictation {
  /** Cleaned action name with date/project references stripped */
  cleanedName: string;
  /** Original input for debugging/logging */
  originalInput: string;
  /** Parsed due date if detected */
  dueDate: Date | null;
  /** Matched project info if detected */
  matchedProject: {
    id: string;
    name: string;
    score: number; // Fuse.js confidence score (0-1, lower is better match)
  } | null;
  /** Metadata about what was extracted */
  extractionDetails: {
    datePhrase: string | null; // e.g., "tomorrow", "next Monday"
    projectPhrase: string | null; // e.g., "for the Exponential project"
  };
}

export interface ProjectForMatching {
  id: string;
  name: string;
}

export interface DateExtractionResult {
  date: Date | null;
  phrase: string | null;
  originalText: string;
  cleanedText: string;
}

export interface ProjectMatchResult {
  project: {
    id: string;
    name: string;
    score: number;
  } | null;
  phrase: string | null;
  originalText: string;
  cleanedText: string;
}
