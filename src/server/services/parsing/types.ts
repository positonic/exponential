export interface ParsedDictation {
  cleanedName: string;
  originalInput: string;
  scheduledStart: Date | null;
  dueDate: Date | null;
  matchedProject: { id: string; name: string; score: number } | null;
  extractionDetails: {
    datePhrase: string | null;
    projectPhrase: string | null;
  };
}

export interface ProjectForMatching {
  id: string;
  name: string;
}

export interface DateExtractionResult {
  date: Date | null;
  dateType: "schedule" | "deadline" | null;
  phrase: string | null;
  originalText: string;
  cleanedText: string;
}
