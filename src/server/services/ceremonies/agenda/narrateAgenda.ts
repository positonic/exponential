/**
 * Narrate an agenda (ADR-0059, ADR-0007 extended): the LLM turns the
 * section items into a short Markdown running order for the people
 * attending. It is given ONLY the items and may not add, drop or reorder
 * them; the narrative is stored beside the structured items and never
 * parsed back. Same model default and temperature as ActionExtractionService.
 */
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { AgendaSnapshot } from "./types";

export const NARRATE_SYSTEM_PROMPT = `You write the pre-read for a recurring team meeting from a structured agenda.

Rules:
- The agenda below is the complete list of items. Do NOT introduce any item, topic, name, number, date or claim that is not in it. Do not speculate about causes or outcomes.
- Keep every section, in the given order, with its title as a Markdown heading (## Title). Under each, one short line per item, in the given order, keeping the item's wording; you may add the detail in parentheses. Mark carried-over items with "(carried over)" and resolved items with "~~strikethrough~~".
- For an empty section write one line: "Nothing to raise." (or the reason given).
- Open with one sentence saying what the meeting needs to get through, using only counts you can see. Close with nothing.
- Plain Markdown, no tables, no emoji, under 250 words. British English.
- No links, URLs, bold or italics: an item that mentions an issue or ticket stays plain text exactly as written.`;

export interface NarrateOptions {
  modelName?: string;
  /** Test seam: replaces the model call. */
  invoke?: (system: string, human: string) => Promise<string>;
}

export function buildNarrationInput(ceremonyName: string, when: string, agenda: AgendaSnapshot): string {
  const lines: string[] = [`Ceremony: ${ceremonyName}`, `When: ${when}`, ""];
  for (const section of agenda.sections) {
    lines.push(`## ${section.title}${section.minutes ? ` (${section.minutes} min)` : ""}`);
    if (section.items.length === 0) {
      lines.push(`- (empty: ${section.emptyReason ?? "Nothing to raise"})`);
    }
    for (const item of section.items) {
      const flags = [item.carriedFromOccurrenceId ? "carried over" : null, item.resolvedAt ? "resolved" : null].filter(Boolean);
      lines.push(`- ${item.title}${item.detail ? ` — ${item.detail}` : ""}${flags.length ? ` [${flags.join(", ")}]` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Returns the Markdown narrative, or null when narration is not configured. */
export async function narrateAgenda(
  input: { ceremonyName: string; when: string; agenda: AgendaSnapshot },
  options: NarrateOptions = {},
): Promise<string | null> {
  const human = buildNarrationInput(input.ceremonyName, input.when, input.agenda);
  if (options.invoke) return (await options.invoke(NARRATE_SYSTEM_PROMPT, human)).trim();
  if (!process.env.OPENAI_API_KEY) return null;
  const modelName = options.modelName ?? process.env.LLM_MODEL ?? "gpt-4o";
  const model = new ChatOpenAI({ modelName, temperature: 0 });
  const response = await model.invoke([new SystemMessage(NARRATE_SYSTEM_PROMPT), new HumanMessage(human)]);
  const text = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  return text.trim();
}
