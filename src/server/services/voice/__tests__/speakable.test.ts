import { describe, it, expect } from "vitest";

import {
  stripMarkdown,
  speakableDate,
  ordinal,
  speakableCount,
  boundLength,
  toSpeakable,
  speakableCaptureConfirmation,
  DEFAULT_MAX_SPEAKABLE_LENGTH,
} from "../speakable";

describe("stripMarkdown", () => {
  it("removes heading hashes", () => {
    expect(stripMarkdown("# Today\n## Plan")).toBe("Today Plan");
  });

  it("removes bold, italic, and strikethrough markers", () => {
    expect(stripMarkdown("**bold** _italic_ ~~gone~~ *also*")).toBe(
      "bold italic gone also",
    );
  });

  it("keeps link and image text but drops urls", () => {
    expect(stripMarkdown("see [the docs](https://x.com/y)")).toBe("see the docs");
    expect(stripMarkdown("![a cat](http://img/cat.png)")).toBe("a cat");
  });

  it("unwraps inline code and fenced code blocks", () => {
    expect(stripMarkdown("run `npm test` now")).toBe("run npm test now");
    expect(stripMarkdown("```ts\nconst x = 1;\n```")).toBe("const x = 1;");
  });

  it("strips list and blockquote markers", () => {
    expect(stripMarkdown("- one\n- two\n1. three")).toBe("one two three");
    expect(stripMarkdown("> quoted")).toBe("quoted");
  });

  it("collapses whitespace and newlines to single spaces", () => {
    expect(stripMarkdown("a\n\n  b\t c")).toBe("a b c");
  });
});

describe("ordinal", () => {
  it("handles the common suffixes", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
  });

  it("handles the 11-13 exceptions", () => {
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(12)).toBe("12th");
    expect(ordinal(13)).toBe("13th");
    expect(ordinal(21)).toBe("21st");
    expect(ordinal(112)).toBe("112th");
  });
});

describe("speakableDate", () => {
  const now = new Date(2026, 4, 31); // Sun May 31 2026 (local)

  it("says today / tomorrow / yesterday", () => {
    expect(speakableDate(new Date(2026, 4, 31), now)).toBe("today");
    expect(speakableDate(new Date(2026, 5, 1), now)).toBe("tomorrow");
    expect(speakableDate(new Date(2026, 4, 30), now)).toBe("yesterday");
  });

  it("names a weekday within the coming week", () => {
    // Fri Jun 5 2026 is 5 days after Sun May 31
    expect(speakableDate(new Date(2026, 5, 5), now)).toBe("on Friday");
  });

  it("uses month + ordinal for farther dates in the same year", () => {
    expect(speakableDate(new Date(2026, 11, 25), now)).toBe("on December 25th");
  });

  it("includes the year when it differs", () => {
    expect(speakableDate(new Date(2027, 0, 1), now)).toBe("on January 1st, 2027");
  });
});

describe("speakableCount", () => {
  it("pluralises and renders zero as 'no'", () => {
    expect(speakableCount(0, "action")).toBe("no actions");
    expect(speakableCount(1, "action")).toBe("1 action");
    expect(speakableCount(3, "action")).toBe("3 actions");
  });

  it("supports irregular plurals", () => {
    expect(speakableCount(2, "is", "are")).toBe("2 are");
  });
});

describe("boundLength", () => {
  it("leaves short strings untouched", () => {
    expect(boundLength("short", 240)).toBe("short");
  });

  it("never exceeds the max and does not cut mid-word", () => {
    const text = "the quick brown fox jumps over the lazy dog again and again";
    const out = boundLength(text, 20);
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith("…")).toBe(true);
    // no partial trailing word before the ellipsis
    expect(out.slice(0, -1).trim().split(" ").every((w) => text.includes(w))).toBe(
      true,
    );
  });

  it("defaults to the documented ceiling", () => {
    const long = "a ".repeat(400);
    expect(boundLength(long).length).toBeLessThanOrEqual(DEFAULT_MAX_SPEAKABLE_LENGTH);
  });
});

describe("toSpeakable", () => {
  it("strips markdown and bounds length together", () => {
    const out = toSpeakable("# Heading\n\n**lots** of _words_ here", 100);
    expect(out).toBe("Heading lots of words here");
  });
});

describe("speakableCaptureConfirmation", () => {
  const now = new Date(2026, 4, 31);

  it("reads back name, due date, and named project", () => {
    expect(
      speakableCaptureConfirmation({
        name: "draft the investor update",
        dueDate: new Date(2026, 5, 5),
        projectName: "Acme",
        now,
      }),
    ).toBe('Added "draft the investor update" due on Friday in Acme.');
  });

  it("says inbox when there is no project", () => {
    expect(
      speakableCaptureConfirmation({
        name: "buy milk",
        dueDate: null,
        projectName: null,
        now,
      }),
    ).toBe('Added "buy milk" to your inbox.');
  });

  it("omits the due date when absent", () => {
    expect(
      speakableCaptureConfirmation({
        name: "call Sam",
        dueDate: null,
        projectName: "Sales",
        now,
      }),
    ).toBe('Added "call Sam" in Sales.');
  });
});
