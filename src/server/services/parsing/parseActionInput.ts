import type { PrismaClient } from "@prisma/client";

import { parseDictation } from "./DictationParser";
import type { ProjectForMatching } from "./types";

export interface ParseActionInputResult {
  name: string;
  dueDate: Date | null;
  projectId: string | null;
  parsingMetadata: {
    originalInput: string;
    datePhrase: string | null;
    projectPhrase: string | null;
    matchedProject: { id: string; name: string } | null;
  } | null;
}

export interface ParseActionInputOptions {
  /** If provided, skip project matching and use this projectId */
  projectId?: string;
  /** Whether to parse natural language (default: true) */
  parseNaturalLanguage?: boolean;
}

/**
 * Parse action input text to extract name, due date, and project.
 * Shared helper used by quickCreate API and Slack integration.
 *
 * @param input - Raw action text (e.g., "Call John tomorrow for sales project")
 * @param userId - User ID to fetch projects for
 * @param db - Prisma client instance
 * @param options - Optional configuration
 * @returns Parsed action details with cleaned name, dueDate, and projectId
 */
export async function parseActionInput(
  input: string,
  userId: string,
  db: PrismaClient,
  options?: ParseActionInputOptions
): Promise<ParseActionInputResult> {
  const shouldParse = options?.parseNaturalLanguage ?? true;

  if (!shouldParse) {
    return {
      name: input.trim(),
      dueDate: null,
      projectId: options?.projectId ?? null,
      parsingMetadata: null,
    };
  }

  // Fetch user's active projects for matching
  const userProjects: ProjectForMatching[] = await db.project.findMany({
    where: {
      createdById: userId,
      status: { not: "COMPLETED" },
    },
    select: {
      id: true,
      name: true,
    },
  });

  // Parse the input
  const parsed = parseDictation(input, userProjects);

  // Use explicit projectId if provided, otherwise use matched project
  const finalProjectId =
    options?.projectId ?? parsed.matchedProject?.id ?? null;

  return {
    name: parsed.cleanedName,
    dueDate: parsed.dueDate,
    projectId: finalProjectId,
    parsingMetadata: {
      originalInput: parsed.originalInput,
      datePhrase: parsed.extractionDetails.datePhrase,
      projectPhrase: parsed.extractionDetails.projectPhrase,
      matchedProject: parsed.matchedProject
        ? { id: parsed.matchedProject.id, name: parsed.matchedProject.name }
        : null,
    },
  };
}
