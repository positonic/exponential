import { describe, expect, it } from "vitest";
import { draftFromAction, splitUrl } from "../migrate-reading-project-to-resources";

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
