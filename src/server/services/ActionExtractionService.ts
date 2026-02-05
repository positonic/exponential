import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { FirefliesService } from "./FirefliesService";
import { type ParsedActionItem } from "./processors/ActionProcessor";

const extractionSchema = z.object({
  actions: z.array(
    z.object({
      text: z.string().min(1),
      assigneeName: z.string().optional(),
      dueDateText: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      isFirstPerson: z.boolean().optional(),
    })
  ),
});

interface ExtractOptions {
  maxActions?: number;
  modelName?: string;
}

const DEFAULT_MAX_ACTIONS = 25;
const MAX_CHARS_PER_CHUNK = 6000;

function normalizeActionText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function chunkTranscript(transcriptText: string, maxChars: number): string[] {
  const lines = transcriptText.split(/\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current.length > 0 ? `${current}\n${line}` : line;
    if (next.length > maxChars) {
      if (current.length > 0) {
        chunks.push(current);
        current = line;
      } else {
        chunks.push(line.slice(0, maxChars));
        current = line.slice(maxChars);
      }
    } else {
      current = next;
    }
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function parseJsonFromModelOutput(output: string): unknown {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output.");
  }
  const jsonText = output.slice(start, end + 1);
  return JSON.parse(jsonText);
}

function buildSystemPrompt(): string {
  return [
    "You extract actionable tasks and next steps from meeting transcripts.",
    "Return ONLY valid JSON matching this schema:",
    '{"actions":[{"text":"...", "assigneeName":"...", "dueDateText":"...", "confidence":0.0, "isFirstPerson":true}]}',
    "Rules:",
    "- Only include concrete action items or next steps.",
    "- Exclude questions, opinions, headings, timestamps, and summaries.",
    "- If a line is a first-person commitment (e.g. \"I'll do X\"), set assigneeName to the current speaker.",
    "- If a person is explicitly mentioned as responsible, set assigneeName to that name.",
    "- If no assignee is clear, omit assigneeName.",
    "- dueDateText should be a short phrase like \"next week\" or \"by Friday\" if present.",
    "- Keep action text concise and imperative.",
  ].join("\n");
}

function buildChunkPrompt(chunk: string): string {
  return [
    "Transcript chunk:",
    chunk,
    "",
    "Extract actions from this chunk only.",
  ].join("\n");
}

export class ActionExtractionService {
  static async extractFromTranscript(
    transcriptText: string,
    options: ExtractOptions = {}
  ): Promise<ParsedActionItem[]> {
    if (!transcriptText || transcriptText.trim().length === 0) {
      return [];
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return FirefliesService.extractActionItemsFromTranscriptText(transcriptText);
    }

    const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
    const modelName = options.modelName ?? process.env.LLM_MODEL ?? "gpt-3.5-turbo";
    const model = new ChatOpenAI({
      modelName,
      temperature: 0,
    });

    const chunks = chunkTranscript(transcriptText, MAX_CHARS_PER_CHUNK);
    const dedupe = new Set<string>();
    const results: ParsedActionItem[] = [];

    for (const chunk of chunks) {
      const response = await model.invoke([
        new SystemMessage(buildSystemPrompt()),
        new HumanMessage(buildChunkPrompt(chunk)),
      ]);

      const rawContent = typeof response.content === "string" ? response.content : "";
      let parsed: z.infer<typeof extractionSchema> | null = null;

      try {
        const json = parseJsonFromModelOutput(rawContent);
        parsed = extractionSchema.parse(json);
      } catch {
        parsed = null;
      }

      if (!parsed) {
        continue;
      }

      for (const action of parsed.actions) {
        const normalized = normalizeActionText(action.text);
        if (!normalized || dedupe.has(normalized)) {
          continue;
        }
        dedupe.add(normalized);

        const dueDate =
          (action.dueDateText ? FirefliesService.parseDate(action.dueDateText) : undefined) ??
          FirefliesService.extractDueDateFromText(action.text);

        const assignee =
          action.assigneeName ?? FirefliesService.parseAssigneeFromText(action.text);

        results.push({
          text: action.text,
          assignee: assignee,
          dueDate: dueDate,
          context: `From transcript: "${action.text}"`,
        });

        if (results.length >= maxActions) {
          return results;
        }
      }
    }

    if (results.length === 0) {
      return FirefliesService.extractActionItemsFromTranscriptText(transcriptText);
    }

    return results;
  }
}
