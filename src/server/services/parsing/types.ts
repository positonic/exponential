export interface ParsedDictation {
  cleanedName: string;
  originalInput: string;
  dueDate: Date | null;
  extractionDetails: {
    datePhrase: string | null;
  };
}

export interface DateExtractionResult {
  date: Date | null;
  phrase: string | null;
  originalText: string;
  cleanedText: string;
}
