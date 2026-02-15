import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { FirefliesService } from "./FirefliesService";
import { type ParsedActionItem } from "./processors/ActionProcessor";

export function numberScreenshotMarkers(text: string): { numberedText: string; count: number } {
  let count = 0;
  const numberedText = text.replace(/\[SCREENSHOT\]/g, () => {
    count++;
    return `[SCREENSHOT-${count}]`;
  });
  return { numberedText, count };
}

const extractionSchema = z.object({
  actions: z.array(
    z.object({
      text: z.string().min(1),
      assigneeName: z.string().optional(),
      dueDateText: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
      isFirstPerson: z.boolean().optional(),
      screenshotRefs: z.array(z.number()).optional(),
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
    "You extract actionable tasks from transcribed audio. The input may be a meeting transcript, a voice note, a personal reminder, or any spoken recording.",
    "Return ONLY valid JSON matching this schema:",
    '{"actions":[{"text":"...", "assigneeName":"...", "dueDateText":"...", "confidence":0.0, "isFirstPerson":true, "screenshotRefs":[1]}]}',
    "Rules:",
    "- Extract ANY task, to-do, reminder, commitment, or next step mentioned in the text.",
    "- Include personal tasks and reminders (e.g. \"call mom\", \"buy groceries\", \"schedule dentist\").",
    "- Include work tasks and follow-ups (e.g. \"send the report\", \"review the PR\").",
    "- Exclude pure observations, opinions, greetings, and filler words.",
    "- If a person says they will do something (e.g. \"I need to X\", \"I'll do X\", \"make sure to X\", \"don't forget to X\"), extract it as an action.",
    "- If a person is explicitly mentioned as responsible, set assigneeName to that name.",
    "- If the speaker is assigning the task to themselves, set isFirstPerson to true.",
    "- If no assignee is clear, omit assigneeName.",
    "- dueDateText should be a short phrase like \"next week\" or \"by Friday\" if mentioned.",
    "- Keep action text concise and imperative (e.g. \"Call mom\" not \"You should call your mom\").",
    "- When a single sentence contains multiple tasks, split them into separate actions.",
    "- The transcript may contain [SCREENSHOT-N] markers indicating screenshots taken during recording.",
    "- If an action relates to text near a [SCREENSHOT-N] marker, include the number(s) in screenshotRefs.",
    "- Example: if speaker says 'fix this layout' near [SCREENSHOT-3], return screenshotRefs: [3].",
    "- An action can reference zero or multiple screenshots. Omit screenshotRefs if none are relevant.",
  ].join("\n");
}

function buildChunkPrompt(chunk: string): string {
  return [
    "Transcribed audio:",
    chunk,
    "",
    "Extract all actionable tasks from this text.",
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
      console.log("[ActionExtraction] No OPENAI_API_KEY, falling back to regex extraction");
      return FirefliesService.extractActionItemsFromTranscriptText(transcriptText);
    }

    const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
    const modelName = options.modelName ?? process.env.LLM_MODEL ?? "gpt-4o";
    console.log(`[ActionExtraction] Using model=${modelName}, maxActions=${maxActions}, textLength=${transcriptText.length}`);
    const model = new ChatOpenAI({
      modelName,
      temperature: 0,
    });

    const chunks = chunkTranscript(transcriptText, MAX_CHARS_PER_CHUNK);
    console.log(`[ActionExtraction] Split into ${chunks.length} chunk(s)`);
    const dedupe = new Set<string>();
    const results: ParsedActionItem[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      console.log(`[ActionExtraction] Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars): "${chunk.slice(0, 100)}..."`);

      const response = await model.invoke([
        new SystemMessage(buildSystemPrompt()),
        new HumanMessage(buildChunkPrompt(chunk)),
      ]);

      const rawContent = typeof response.content === "string" ? response.content : "";
      console.log(`[ActionExtraction] Raw model response: ${rawContent}`);
      let parsed: z.infer<typeof extractionSchema> | null = null;

      try {
        const json = parseJsonFromModelOutput(rawContent);
        parsed = extractionSchema.parse(json);
        console.log(`[ActionExtraction] Parsed ${parsed.actions.length} actions from chunk`);
      } catch (parseErr) {
        console.log(`[ActionExtraction] Failed to parse model response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
        parsed = null;
      }

      if (!parsed) {
        continue;
      }

      for (const action of parsed.actions) {
        const normalized = normalizeActionText(action.text);
        if (!normalized || dedupe.has(normalized)) {
          console.log(`[ActionExtraction] Skipping duplicate/empty: "${action.text}"`);
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
          screenshotRefs: action.screenshotRefs,
        });

        if (results.length >= maxActions) {
          return results;
        }
      }
    }

    console.log(`[ActionExtraction] AI extraction found ${results.length} items total`);
    if (results.length === 0) {
      console.log("[ActionExtraction] Falling back to regex extraction");
      const fallbackResults = FirefliesService.extractActionItemsFromTranscriptText(transcriptText);
      console.log(`[ActionExtraction] Regex fallback found ${fallbackResults.length} items`);
      return fallbackResults;
    }

    return results;
  }
}
