import { describe, expect, it, vi } from "vitest";
import type { Resource } from "@prisma/client";

vi.mock("~/env", () => ({ env: {} }));

import { ResourceSource, articleSections } from "../ResourceSource";

describe("articleSections", () => {
  it("gives each section its title and heading, and keeps link text without the URL", () => {
    const article = [
      "The standfirst.",
      "",
      "## What it is",
      "",
      "[Watch from 5:40](https://www.youtube.com/watch?v=x&t=340s)",
      "",
      "First section.",
      "",
      "### A subheading stays inside its section",
      "More of it.",
      "",
      "## Composing contracts",
      "Second section.",
    ].join("\n");

    expect(articleSections("A talk", article)).toEqual([
      { context: "A talk", text: "The standfirst." },
      {
        context: "A talk › What it is",
        text: "Watch from 5:40\n\nFirst section.\n\n### A subheading stays inside its section\nMore of it.",
      },
      { context: "A talk › Composing contracts", text: "Second section." },
    ]);
  });

  it("doesn't take a ## inside a code fence for a heading", () => {
    const article = "## Real\n```md\n## not a heading\n```";

    expect(articleSections("T", article)).toEqual([
      { context: "T › Real", text: "```md\n## not a heading\n```" },
    ]);
  });
});

describe("ResourceSource", () => {
  const row = (fields: Partial<Resource>) =>
    ResourceSource.fromEntity({
      title: "T",
      content: "## S\nbody",
      rawContent: "[0:00] the transcript",
      contentType: "video",
      mimeType: "text/markdown",
      ...fields,
    } as Resource);

  it("indexes a video article by section, and never its transcript", () => {
    const source = row({});

    expect(source.getSections()).toEqual([{ context: "T › S", text: "body" }]);
    expect(source.getContent()).toBe("## S\nbody");
  });

  it("leaves every other Resource to plain chunking", () => {
    expect(row({ contentType: "note" }).getSections()).toBeNull();
    expect(row({ mimeType: null }).getSections()).toBeNull();
  });
});
