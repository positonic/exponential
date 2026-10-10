import { describe, expect, it } from "vitest";
import { cleanText, draftFromAction, splitUrl } from "../migrate-reading-project-to-resources";

const base = {
  id: "a1",
  description: null,
  status: "ACTIVE",
  completedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

describe("splitUrl", () => {
  it("pulls the first http(s) link out and returns the remaining text", () => {
    expect(splitUrl("Read this https://example.com/a?b=1 tonight")).toEqual({
      url: "https://example.com/a?b=1",
      rest: "Read this tonight",
    });
  });

  it("drops trailing punctuation that followed a pasted link", () => {
    expect(splitUrl("See https://example.com/post.").url).toBe("https://example.com/post");
    expect(splitUrl("(https://example.com/post)").url).toBe("https://example.com/post");
  });

  it("returns no url when there is none", () => {
    expect(splitUrl("  Just a note  ")).toEqual({ url: null, rest: "Just a note" });
  });
});

describe("draftFromAction", () => {
  it("a link in the name becomes a to_read bookmark titled by the rest of the name", () => {
    const d = draftFromAction({ ...base, name: "Attention is all you need https://arxiv.org/abs/1706.03762" });
    expect(d).toMatchObject({
      title: "Attention is all you need",
      url: "https://arxiv.org/abs/1706.03762",
      contentType: "bookmark",
      readStatus: "to_read",
      readAt: null,
      sourceActionId: "a1",
    });
  });

  it("a bare link falls back to the hostname as the title", () => {
    const d = draftFromAction({ ...base, name: "https://www.example.com/long/path" });
    expect(d.title).toBe("example.com");
    expect(d.url).toBe("https://www.example.com/long/path");
  });

  it("finds the link in the description when the name has none, keeping the leftover text", () => {
    const d = draftFromAction({
      ...base,
      name: "Essay on focus",
      description: "https://example.com/focus recommended by Sam",
    });
    expect(d).toMatchObject({
      title: "Essay on focus",
      url: "https://example.com/focus",
      description: "recommended by Sam",
      contentType: "bookmark",
    });
  });

  it("a completed action becomes a read resource stamped with completedAt", () => {
    const done = new Date("2026-09-15T10:00:00Z");
    const d = draftFromAction({ ...base, name: "Finished book", status: "COMPLETED", completedAt: done });
    expect(d).toMatchObject({ readStatus: "read", readAt: done, contentType: "note", url: null });
  });

  it("a completed action with no completedAt falls back to createdAt", () => {
    const d = draftFromAction({ ...base, name: "Old one", status: "COMPLETED" });
    expect(d.readAt).toEqual(base.createdAt);
  });

  it("keeps the action's createdAt so the Reading list orders by when it was saved", () => {
    expect(draftFromAction({ ...base, name: "x" }).createdAt).toEqual(base.createdAt);
  });
});

describe("cleanText", () => {
  it("strips anchor markup and decodes entities, including double-encoded ones", () => {
    expect(cleanText('<a href="">Mesh LLM: distributed AI &amp; iroh</a>')).toBe("Mesh LLM: distributed AI & iroh");
    expect(cleanText('venus on X: &amp;quot;How to Build&amp;quot; / X')).toBe('venus on X: "How to Build" / X');
  });

  it("drops a tab unread counter, at the start or after a 'prefix: ' separator", () => {
    expect(cleanText("(3) DAN KOE on X")).toBe("DAN KOE on X");
    expect(cleanText("Read: (3) DAN KOE on X")).toBe("Read: DAN KOE on X");
    expect(cleanText("Section (3) of the act")).toBe("Section (3) of the act");
  });
});

describe("draftFromAction with browser-pasted names", () => {
  it("titles the resource by the cleaned anchor text, not the markup", () => {
    const d = draftFromAction({
      ...base,
      name: '<a href="">What is Ngit? - Soapbox Blog</a>',
      description: "https://soapbox.pub/blog/what-is-ngit",
    });
    expect(d.title).toBe("What is Ngit? - Soapbox Blog");
    expect(d.description).toBeNull();
    expect(d.url).toBe("https://soapbox.pub/blog/what-is-ngit");
  });

  it("keeps a user prefix like 'Read:' and cleans the quoted X title", () => {
    const d = draftFromAction({
      ...base,
      name: 'Read: The Art Of Strategic Thinking: <a href="">(3) DAN KOE on X: &amp;quot;The Art&amp;quot; / X</a> https://x.com/thedankoe/status/1',
    });
    expect(d.title).toBe('Read: The Art Of Strategic Thinking: DAN KOE on X: "The Art" / X');
  });
});

