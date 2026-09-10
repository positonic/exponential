import { describe, expect, it } from "vitest";
import { NARRATE_SYSTEM_PROMPT, buildNarrationInput, narrateAgenda } from "../narrateAgenda";
import type { AgendaSnapshot } from "../types";

const agenda: AgendaSnapshot = {
  version: 1,
  generatedAt: "2026-09-10T08:00:00Z",
  sections: [
    { key: "blk", type: "blockers", title: "Blockers", minutes: 5, items: [
      { id: "b1", sectionKey: "blk", title: "Fix login", refType: "action", refId: "a-1", order: 0, detail: "due 8 Sept · Andi" },
      { id: "b2", sectionKey: "blk", title: "Old thing", refType: "action", refId: "a-2", order: 1, carriedFromOccurrenceId: "occ-0", resolvedAt: "2026-09-09T00:00:00Z" },
    ] },
    { key: "free", type: "free_text", title: "Anything else", items: [], emptyReason: "Nothing to raise" },
  ],
};

describe("narrateAgenda", () => {
  it("the system prompt forbids inventing items and fixes the output shape", () => {
    expect(NARRATE_SYSTEM_PROMPT).toMatchInlineSnapshot(`
      "You write the pre-read for a recurring team meeting from a structured agenda.

      Rules:
      - The agenda below is the complete list of items. Do NOT introduce any item, topic, name, number, date or claim that is not in it. Do not speculate about causes or outcomes.
      - Keep every section, in the given order, with its title as a Markdown heading (## Title). Under each, one short line per item, in the given order, keeping the item's wording; you may add the detail in parentheses. Mark carried-over items with "(carried over)" and resolved items with "~~strikethrough~~".
      - For an empty section write one line: "Nothing to raise." (or the reason given).
      - Open with one sentence saying what the meeting needs to get through, using only counts you can see. Close with nothing.
      - Plain Markdown, no tables, no emoji, under 250 words. British English.
      - No links, URLs, bold or italics: an item that mentions an issue or ticket stays plain text exactly as written."
    `);
  });

  it("feeds the model only the items, with flags and empty reasons", () => {
    const input = buildNarrationInput("Daily Standup", "Fri 11 Sept, 09:00", agenda);
    expect(input).toBe(`Ceremony: Daily Standup
When: Fri 11 Sept, 09:00

## Blockers (5 min)
- Fix login — due 8 Sept · Andi
- Old thing [carried over, resolved]

## Anything else
- (empty: Nothing to raise)
`);
  });

  it("returns the model text through the invoke seam and null when no key is configured", async () => {
    const calls: Array<[string, string]> = [];
    const text = await narrateAgenda({ ceremonyName: "Daily Standup", when: "now", agenda }, {
      invoke: async (system, human) => {
        calls.push([system, human]);
        return "  ## Blockers\n- Fix login (due 8 Sept)\n";
      },
    });
    expect(text).toBe("## Blockers\n- Fix login (due 8 Sept)");
    expect(calls[0]![0]).toBe(NARRATE_SYSTEM_PROMPT);
    const saved = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(await narrateAgenda({ ceremonyName: "x", when: "y", agenda })).toBeNull();
    } finally {
      if (saved !== undefined) process.env.OPENAI_API_KEY = saved;
    }
  });
});
