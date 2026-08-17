/**
 * Tests for meeting action extraction — specifically the notes-aware path
 * added because "Create Actions" used to run only on the transcript and
 * silently ignored an explicit "Action Items" list typed into the Add
 * Meeting modal's Notes field. Covers the deterministic notes list parser,
 * the notes-first merge, and the exclude-already-captured plumbing on the
 * transcript extraction. Only the model call is stubbed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    invoke = invokeMock;
  },
}));

import {
  ActionExtractionService,
  extractNotesListItems,
  mergeActionItems,
} from "../ActionExtractionService";

// Mirrors the real-world notes that surfaced the bug: prose bullet before the
// heading, numbered list with an indented sub-bullet, a trailing empty item,
// and non-action prose sections after the list.
const MEETING_NOTES = [
  "* This is my notes!",
  "",
  "Action Items:",
  "",
  "1. Hire designers",
  "2. Hire comms",
  "3. Integrate product strategy",
  "   1. https://app.notion.com/p/MVP-Strategic-Vision",
  "4. Zineb to send baseline document to James",
  "5. Check if PDMs are geolocated",
  "6. ",
  "",
  "Situation Report (Regarding Noah)",
  "",
  "* If you create the Crisis overview then you can generate the situation report.",
].join("\n");

describe("extractNotesListItems", () => {
  it("extracts every numbered item under an Action Items heading", () => {
    const items = extractNotesListItems(MEETING_NOTES);
    expect(items.map((item) => item.text)).toEqual([
      "Hire designers",
      "Hire comms",
      "Integrate product strategy",
      "Zineb to send baseline document to James",
      "Check if PDMs are geolocated",
    ]);
  });

  it("scopes to the Action Items section: pre-heading and post-section bullets are not actions", () => {
    const texts = extractNotesListItems(MEETING_NOTES).map((item) => item.text);
    expect(texts).not.toContain("This is my notes!");
    expect(texts.some((text) => text.includes("Crisis overview"))).toBe(false);
  });

  it("keeps an indented sub-bullet as detail on its parent, not a separate action", () => {
    const items = extractNotesListItems(MEETING_NOTES);
    const strategy = items.find((item) => item.text === "Integrate product strategy");
    expect(strategy?.context).toContain("https://app.notion.com/p/MVP-Strategic-Vision");
    expect(items.some((item) => item.text.startsWith("https://"))).toBe(false);
  });

  it('parses "<Name> to <verb>" as the assignee', () => {
    const items = extractNotesListItems(MEETING_NOTES);
    const baseline = items.find((item) => item.text.includes("baseline document"));
    expect(baseline?.assignee).toBe("Zineb");
  });

  it("treats every top-level list item as an action when there is no heading", () => {
    const items = extractNotesListItems(
      "- Call mom\n- Buy groceries\n  - milk\n* Send the report",
    );
    expect(items.map((item) => item.text)).toEqual([
      "Call mom",
      "Buy groceries",
      "Send the report",
    ]);
    expect(items[1]?.context).toContain("milk");
  });

  it("returns nothing for prose-only notes", () => {
    expect(extractNotesListItems("We talked about the roadmap.\nGood meeting.")).toEqual([]);
  });
});

describe("mergeActionItems", () => {
  it("keeps the primary (notes) version when the secondary repeats it", () => {
    const merged = mergeActionItems(
      [{ text: "Hire designers", context: "From notes" }],
      [
        { text: "  hire   Designers ", context: "From transcript" },
        { text: "Finalize the budget", context: "From transcript" },
      ],
    );
    expect(merged.map((item) => item.context)).toEqual([
      "From notes",
      "From transcript",
    ]);
  });

  it("caps the merged list", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ text: `Task ${i}` }));
    expect(mergeActionItems(many, [], 25)).toHaveLength(25);
  });
});

function notesModelReply(actions: unknown[]): { content: string } {
  return { content: JSON.stringify({ actions }) };
}

describe("ActionExtractionService.extractFromNotes", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    invokeMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("maps model output to items with notes provenance, detail, and assignee", async () => {
    invokeMock.mockResolvedValueOnce(
      notesModelReply([
        {
          text: "Integrate product strategy",
          detail: "https://app.notion.com/p/MVP-Strategic-Vision",
        },
        { text: "Zineb to send baseline document to James", assigneeName: "Zineb" },
      ]),
    );

    const items = await ActionExtractionService.extractFromNotes(MEETING_NOTES);

    expect(items).toHaveLength(2);
    expect(items[0]?.context).toBe(
      'From notes: "Integrate product strategy" (https://app.notion.com/p/MVP-Strategic-Vision)',
    );
    expect(items[1]?.assignee).toBe("Zineb");
    expect(items[1]?.context).toBe(
      'From notes: "Zineb to send baseline document to James"',
    );
  });

  it("falls back to the deterministic list parser when the model answers prose", async () => {
    invokeMock.mockResolvedValueOnce({ content: "No JSON for you." });

    const items = await ActionExtractionService.extractFromNotes(MEETING_NOTES);

    expect(items.map((item) => item.text)).toContain("Hire designers");
    expect(items).toHaveLength(5);
  });

  it("uses the deterministic parser when no API key is configured", async () => {
    delete process.env.OPENAI_API_KEY;

    const items = await ActionExtractionService.extractFromNotes(MEETING_NOTES);

    expect(invokeMock).not.toHaveBeenCalled();
    expect(items).toHaveLength(5);
  });

  it("returns nothing for empty notes without calling the model", async () => {
    expect(await ActionExtractionService.extractFromNotes("   ")).toEqual([]);
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("ActionExtractionService.extractFromTranscript with excludeActions", () => {
  const originalApiKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    invokeMock.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
  });

  it("tells the model which actions the notes already captured", async () => {
    invokeMock.mockResolvedValueOnce(notesModelReply([]));

    await ActionExtractionService.extractFromTranscript("We should hire designers soon.", {
      excludeActions: ["Hire designers"],
    });

    const [, humanMessage] = invokeMock.mock.calls[0]?.[0] as [unknown, { content: string }];
    expect(humanMessage.content).toContain("<already-captured>");
    expect(humanMessage.content).toContain("- Hire designers");
  });

  it("drops an exact re-occurrence of an excluded action even if the model returns it", async () => {
    invokeMock.mockResolvedValueOnce(
      notesModelReply([
        { text: "Hire Designers" },
        { text: "Finalize the budget by Thursday" },
      ]),
    );

    const items = await ActionExtractionService.extractFromTranscript("transcript text here", {
      excludeActions: ["Hire designers"],
    });

    expect(items.map((item) => item.text)).toEqual(["Finalize the budget by Thursday"]);
  });

  it("does not run the regex fallback when exclusions explain the empty result", async () => {
    invokeMock.mockResolvedValueOnce(notesModelReply([]));

    const items = await ActionExtractionService.extractFromTranscript(
      "I will hire designers for the response plan.",
      { excludeActions: ["Hire designers"] },
    );

    // Without the guard, the regex fallback would re-extract "hire designers"
    // from this sentence — exactly what the exclusion said was covered.
    expect(items).toEqual([]);
  });
});
