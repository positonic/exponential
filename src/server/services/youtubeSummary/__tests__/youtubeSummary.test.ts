/**
 * YouTube Reading-list articles: source order (Supadata + Claude first,
 * Gemini fallback), the conditional write, and the retry sweep. Every network
 * call goes through a stubbed `fetch` and a stubbed Anthropic client — no
 * vendor or model calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { embedResourceMock } = vi.hoisted(() => ({ embedResourceMock: vi.fn() }));
vi.mock("~/server/services/KnowledgeService", () => ({
  getKnowledgeService: () => ({ embedResource: embedResourceMock }),
}));

import { youtubeVideoId } from "~/utils/youtube";
import {
  ARTICLE_FALLBACK_MODEL,
  ARTICLE_MODEL,
  fetchSupadataTranscript,
  finishArticle,
  formatTimestamp,
  MAX_TRANSCRIPT_CHARS,
  writeVideoArticle,
  type YouTubeSummaryDeps,
} from "../youtubeSummary";
import { enrichYouTubeResource, isPlaceholderTitle } from "../enrichYouTubeResource";
import { runYouTubeSummarySweep } from "../youtubeSummarySweep";

const WATCH = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Route = (url: string, init?: RequestInit) => Response | undefined;

/** A fetch that answers by URL prefix and records every call. */
function fakeFetch(routes: Record<string, Route | Response>) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    for (const [prefix, route] of Object.entries(routes)) {
      if (url.startsWith(prefix)) {
        const res = typeof route === "function" ? route(url, init) : route.clone();
        if (res) return res;
      }
    }
    throw new Error(`unexpected fetch ${url}`);
  });
}

const OEMBED = "https://www.youtube.com/oembed";
const METADATA = "https://api.supadata.ai/v1/metadata";
const SUPADATA = "https://api.supadata.ai/v1/transcript";
const GEMINI = "https://generativelanguage.googleapis.com/";

const ARTICLE = "A standfirst about the talk.\n\n## First idea (1:05)\nThe detail.";
const LINKED = `A standfirst about the talk.\n\n## First idea\n\n[Watch from 1:05](${WATCH}&t=65s)\nThe detail.`;

/** A Claude client whose `messages.stream` answers from a queue, last answer repeating. */
function anthropicReturning(...replies: Array<{ text?: string; stopReason?: string }>) {
  const stream = vi.fn((_params: Record<string, unknown>) => {
    const reply = replies.length > 1 ? replies.shift()! : replies[0]!;
    return {
      finalMessage: async () => ({
        stop_reason: reply.stopReason ?? "end_turn",
        content: [{ type: "text", text: reply.text ?? ARTICLE }],
      }),
    };
  });
  return { stream, client: { messages: { stream } } as unknown as YouTubeSummaryDeps["anthropic"] };
}

function deps(overrides: Partial<YouTubeSummaryDeps> = {}): YouTubeSummaryDeps {
  return {
    fetch: fakeFetch({}),
    anthropic: anthropicReturning({}).client,
    supadataApiKey: "sd-key",
    geminiApiKey: "gm-key",
    geminiModel: "gemini-test",
    ...overrides,
  };
}

const metadataOk = json({ description: "With Dan Barrett. https://prose.md", author: { displayName: "AI Engineer" } });
const metadataMissing = json({ error: "not-found" }, 404);

const geminiOk = json({
  candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: ARTICLE }] } }],
});

describe("youtubeVideoId", () => {
  it.each([
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
    ["https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=30", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/live/dQw4w9WgXcQ?feature=share", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("reads %s", (url, id) => {
    expect(youtubeVideoId(url)).toBe(id);
  });

  it.each([
    "https://example.com/watch?v=dQw4w9WgXcQ",
    "https://notyoutube.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/@somechannel",
    "https://www.youtube.com/watch?v=short",
    "not a url",
    null,
  ])("rejects %s", (url) => {
    expect(youtubeVideoId(url)).toBeNull();
  });
});

describe("isPlaceholderTitle", () => {
  it("treats the hostname, the URL and a browser tab title as placeholders", () => {
    expect(isPlaceholderTitle("youtube.com", WATCH)).toBe(true);
    expect(isPlaceholderTitle(WATCH, WATCH)).toBe(true);
    expect(isPlaceholderTitle("youtu.be", "https://youtu.be/dQw4w9WgXcQ")).toBe(true);
    expect(isPlaceholderTitle("Some talk - YouTube", WATCH)).toBe(true);
  });

  it("keeps a title someone chose", () => {
    expect(isPlaceholderTitle("Watch this before the offsite", WATCH)).toBe(false);
  });
});

describe("formatTimestamp", () => {
  it("adds hours only past the hour", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(65_400)).toBe("1:05");
    expect(formatTimestamp(3_725_000)).toBe("1:02:05");
  });
});

describe("finishArticle", () => {
  it("puts a link to each section's moment under its heading, and takes the opening as the standfirst", () => {
    expect(finishArticle(ARTICLE, WATCH)).toEqual({ article: LINKED, standfirst: "A standfirst about the talk." });
  });

  it("handles times past the hour, and leaves other parentheses alone", () => {
    const { article } = finishArticle("Intro.\n\n## Late (1:02:05)\n\n## Costs (in dollars)\n", WATCH)!;

    expect(article).toContain(`## Late\n\n[Watch from 1:02:05](${WATCH}&t=3725s)`);
    expect(article).toContain("## Costs (in dollars)");
  });

  it("drops a title the model added anyway", () => {
    expect(finishArticle("# A title\n\nThe opening.\n\n## One\nx", WATCH)?.standfirst).toBe("The opening.");
  });

  it("caps a very long standfirst", () => {
    expect(finishArticle(`${"word ".repeat(400)}\n\n## One\nx`, WATCH)!.standfirst.length).toBeLessThan(620);
  });

  it("refuses an article with no opening paragraph", () => {
    expect(finishArticle("## Straight to a heading\nx", WATCH)).toBeNull();
    expect(finishArticle("   ", WATCH)).toBeNull();
  });
});

describe("writeVideoArticle", () => {
  const deadline = () => Date.now() + 30_000;

  it("writes from captions with Sonnet at medium effort, given the channel and description", async () => {
    const { stream, client } = anthropicReturning({});
    const fetch = fakeFetch({ [METADATA]: metadataOk, [SUPADATA]: json({ content: "hello world transcript", lang: "en" }) });

    const out = await writeVideoArticle(WATCH, "A talk", deps({ fetch, anthropic: client }), deadline());

    expect(out).toEqual({
      article: LINKED,
      standfirst: "A standfirst about the talk.",
      transcript: "hello world transcript",
      source: "supadata",
    });
    const transcriptCall = fetch.mock.calls.find(([u]) => String(u).startsWith(SUPADATA))!;
    expect(String(transcriptCall[0])).toContain("mode=native");
    expect(String(transcriptCall[0])).not.toContain("text=true");
    expect((transcriptCall[1]?.headers as Record<string, string>)["x-api-key"]).toBe("sd-key");

    const params = stream.mock.calls[0]![0] as {
      model: string;
      max_tokens: number;
      output_config: { effort: string };
      messages: Array<{ content: string }>;
    };
    expect(params.model).toBe(ARTICLE_MODEL);
    expect(params.output_config.effort).toBe("medium");
    expect(params.max_tokens).toBeGreaterThan(30_000);
    const prompt = params.messages[0]!.content;
    expect(prompt).toContain("Video title: A talk");
    expect(prompt).toContain("Channel: AI Engineer");
    expect(prompt).toContain("<description>\nWith Dan Barrett. https://prose.md\n</description>");
    expect(prompt).toContain("<transcript>\nhello world transcript\n</transcript>");
    expect(fetch.mock.calls.some(([u]) => String(u).startsWith(GEMINI))).toBe(false);
  });

  it("still writes when the description can't be fetched", async () => {
    const { stream, client } = anthropicReturning({});
    const fetch = fakeFetch({ [METADATA]: metadataMissing, [SUPADATA]: json({ content: "words" }) });

    const out = await writeVideoArticle(WATCH, "A talk", deps({ fetch, anthropic: client }), deadline());

    expect(out?.source).toBe("supadata");
    const params = stream.mock.calls[0]![0] as { messages: Array<{ content: string }> };
    expect(params.messages[0]!.content).not.toContain("<description>");
  });

  it("turns timed captions into paragraphs of about a minute, each with its time", async () => {
    const { client } = anthropicReturning({});
    const fetch = fakeFetch({
      [METADATA]: metadataMissing,
      [SUPADATA]: json({
        content: [
          { text: "My name is Dan.", offset: 12_000, duration: 2000 },
          { text: "I made this.", offset: 40_000, duration: 2000 },
          { text: "Next minute.", offset: 73_000, duration: 2000 },
          { text: "  ", offset: 80_000, duration: 2000 },
        ],
      }),
    });

    const out = await writeVideoArticle(WATCH, "A talk", deps({ fetch, anthropic: client }), deadline());

    expect(out?.transcript).toBe("[0:12] My name is Dan. I made this.\n\n[1:13] Next minute.");
  });

  it("falls back to Haiku when Sonnet declines, without the effort setting Haiku rejects", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { stream, client } = anthropicReturning({ stopReason: "refusal", text: "" }, {});
    const fetch = fakeFetch({ [METADATA]: metadataMissing, [SUPADATA]: json({ content: "words" }) });

    const out = await writeVideoArticle(WATCH, "A talk", deps({ fetch, anthropic: client }), deadline());

    expect(out?.article).toBe(LINKED);
    const second = stream.mock.calls[1]![0] as { model: string; output_config?: unknown };
    expect(second.model).toBe(ARTICLE_FALLBACK_MODEL);
    expect(second.output_config).toBeUndefined();
    warn.mockRestore();
  });

  it("never saves an article cut off at the output limit", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = anthropicReturning({ stopReason: "max_tokens" });
    const fetch = fakeFetch({
      [METADATA]: metadataMissing,
      [SUPADATA]: json({ content: "words" }),
      [GEMINI]: json({ error: { message: "private" } }, 403),
    });

    expect(await writeVideoArticle(WATCH, "A talk", deps({ fetch, anthropic: client }), deadline())).toBeNull();
    warn.mockRestore();
  });

  it("falls back to Gemini when the video has no captions", async () => {
    const fetch = fakeFetch({
      [METADATA]: metadataOk,
      [SUPADATA]: json({ error: "transcript-unavailable", message: "none" }, 404),
      [GEMINI]: geminiOk,
    });

    const out = await writeVideoArticle(WATCH, "A talk", deps({ fetch }), deadline());

    expect(out).toEqual({
      article: LINKED,
      standfirst: "A standfirst about the talk.",
      transcript: null,
      source: "gemini",
    });
    const geminiCall = fetch.mock.calls.find(([u]) => String(u).startsWith(GEMINI))!;
    expect(String(geminiCall[0])).toContain("models/gemini-test:generateContent");
    const body = JSON.parse(String(geminiCall[1]?.body)) as {
      contents: Array<{ parts: Array<{ fileData?: { fileUri: string }; text?: string }> }>;
    };
    expect(body.contents[0]!.parts[0]!.fileData?.fileUri).toBe(WATCH);
    expect(body.contents[0]!.parts[1]!.text).toContain("With Dan Barrett.");
  });

  it("falls back to Gemini when Supadata errors (blocked, out of credit)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = fakeFetch({
      [METADATA]: metadataMissing,
      [SUPADATA]: json({ error: "limit-exceeded", message: "quota" }, 429),
      [GEMINI]: geminiOk,
    });

    const out = await writeVideoArticle(WATCH, "A talk", deps({ fetch }), deadline());

    expect(out?.source).toBe("gemini");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("goes straight to Gemini when there is no Anthropic key", async () => {
    const fetch = fakeFetch({ [METADATA]: metadataMissing, [GEMINI]: geminiOk });

    const out = await writeVideoArticle(WATCH, "A talk", deps({ fetch, anthropic: null }), deadline());

    expect(out?.source).toBe("gemini");
    expect(fetch.mock.calls.some(([u]) => String(u).startsWith(SUPADATA))).toBe(false);
  });

  it("returns null when every source fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = fakeFetch({
      [METADATA]: metadataMissing,
      [SUPADATA]: json({ error: "internal-error" }, 500),
      [GEMINI]: json({ error: { message: "video is private" } }, 400),
    });

    expect(await writeVideoArticle(WATCH, "A talk", deps({ fetch }), deadline())).toBeNull();
    warn.mockRestore();
  });

  it("cuts a transcript past the limit and says so in the prompt", async () => {
    const { stream, client } = anthropicReturning({});
    const long = "word ".repeat(MAX_TRANSCRIPT_CHARS / 4);
    const fetch = fakeFetch({ [METADATA]: metadataMissing, [SUPADATA]: json({ content: long }) });

    await writeVideoArticle(WATCH, "Stream", deps({ fetch, anthropic: client }), deadline());

    const prompt = (stream.mock.calls[0]![0] as { messages: Array<{ content: string }> }).messages[0]!.content;
    expect(prompt).toContain("only the first part");
    expect(prompt.length).toBeLessThan(MAX_TRANSCRIPT_CHARS + 500);
  });
});

describe("fetchSupadataTranscript", () => {
  it("polls a 202 job until it completes", async () => {
    vi.useFakeTimers();
    let polls = 0;
    const fetch = fakeFetch({
      [`${SUPADATA}/job-1`]: () => {
        polls += 1;
        return polls < 2 ? json({ status: "active" }) : json({ status: "completed", content: "late transcript" });
      },
      [`${SUPADATA}?`]: json({ jobId: "job-1" }, 202),
    });

    const pending = fetchSupadataTranscript(WATCH, "k", { fetch }, Date.now() + 60_000);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await pending).toBe("late transcript");
    expect(polls).toBe(2);
    vi.useRealTimers();
  });
});

describe("enrichYouTubeResource", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    mockReset(db);
    embedResourceMock.mockReset();
    db.resource.updateMany.mockResolvedValue({ count: 1 });
  });

  const savedLink = {
    id: "r1",
    url: "https://youtu.be/dQw4w9WgXcQ",
    title: "youtu.be",
    author: null,
    content: null,
    contentType: "bookmark",
    mimeType: null,
  };

  it("saves the article as the body and the transcript as the source, and indexes it", async () => {
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    const fetch = fakeFetch({
      [OEMBED]: json({ title: "The Real Title", author_name: "A Channel" }),
      [METADATA]: metadataMissing,
      [SUPADATA]: json({ content: "one two three" }),
    });

    const out = await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(out).toEqual({ status: "written", source: "supadata" });
    const call = db.resource.updateMany.mock.calls[0]![0];
    expect(call.data).toMatchObject({
      title: "The Real Title",
      author: "A Channel",
      summary: "A standfirst about the talk.",
      content: LINKED,
      rawContent: "one two three",
      mimeType: "text/markdown",
      contentType: "video",
    });
    expect(call.data.wordCount).toBeGreaterThan(5);
    expect(embedResourceMock).toHaveBeenCalledWith("r1");
  });

  it("only writes to a row that still has no article, including one with a null mime type", async () => {
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    const fetch = fakeFetch({ [OEMBED]: json({}), [METADATA]: metadataMissing, [SUPADATA]: json({ content: "x" }) });

    await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(db.resource.updateMany.mock.calls[0]![0].where).toEqual({
      id: "r1",
      OR: [{ contentType: { not: "video" } }, { mimeType: null }, { mimeType: { not: "text/markdown" } }],
    });
  });

  it("doesn't index when another job got there first", async () => {
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    db.resource.updateMany.mockResolvedValue({ count: 0 });
    const fetch = fakeFetch({ [OEMBED]: json({}), [METADATA]: metadataMissing, [SUPADATA]: json({ content: "x" }) });

    const out = await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(out).toEqual({ status: "skipped", reason: "already_written" });
    expect(embedResourceMock).not.toHaveBeenCalled();
  });

  it("still reports the article written if indexing fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    embedResourceMock.mockRejectedValue(new Error("openai down"));
    const fetch = fakeFetch({ [OEMBED]: json({}), [METADATA]: metadataMissing, [SUPADATA]: json({ content: "x" }) });

    expect(await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) })).toEqual({
      status: "written",
      source: "supadata",
    });
    error.mockRestore();
  });

  it("upgrades a video summarised the old way, replacing its transcript with a fresh timed one", async () => {
    db.resource.findUnique.mockResolvedValue({
      ...savedLink,
      title: "A talk",
      content: "old transcript",
      contentType: "video",
    } as never);
    const fetch = fakeFetch({ [OEMBED]: json({}), [METADATA]: metadataMissing, [SUPADATA]: json({ content: "fresh transcript" }) });

    await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(db.resource.updateMany.mock.calls[0]![0].data).toMatchObject({
      content: LINKED,
      rawContent: "fresh transcript",
    });
  });

  it("keeps an old video's transcript when only Gemini could write the article", async () => {
    db.resource.findUnique.mockResolvedValue({
      ...savedLink,
      title: "A talk",
      content: "old transcript",
      contentType: "video",
    } as never);
    const fetch = fakeFetch({
      [OEMBED]: json({}),
      [METADATA]: metadataMissing,
      [SUPADATA]: json({ error: "transcript-unavailable" }, 404),
      [GEMINI]: geminiOk,
    });

    await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(db.resource.updateMany.mock.calls[0]![0].data).toMatchObject({
      content: LINKED,
      rawContent: "old transcript",
    });
  });

  it("keeps a title the person typed", async () => {
    db.resource.findUnique.mockResolvedValue({ ...savedLink, title: "For Monday" } as never);
    const fetch = fakeFetch({
      [OEMBED]: json({ title: "The Real Title" }),
      [METADATA]: metadataMissing,
      [SUPADATA]: json({ content: "x" }),
    });

    await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(db.resource.updateMany.mock.calls[0]![0].data).toMatchObject({ title: "For Monday" });
  });

  it("leaves a finished article alone without calling any vendor", async () => {
    db.resource.findUnique.mockResolvedValue({
      ...savedLink,
      contentType: "video",
      mimeType: "text/markdown",
    } as never);
    const fetch = fakeFetch({});

    const out = await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(out).toEqual({ status: "skipped", reason: "already_written" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does nothing when no source is configured", async () => {
    const out = await enrichYouTubeResource(db, "r1", {
      deps: deps({ supadataApiKey: null, geminiApiKey: null }),
    });

    expect(out).toEqual({ status: "skipped", reason: "not_configured" });
    expect(db.resource.findUnique).not.toHaveBeenCalled();
  });

  it("saves only the real title when every source fails, and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    const fetch = fakeFetch({
      [OEMBED]: json({ title: "The Real Title" }),
      [METADATA]: metadataMissing,
      [SUPADATA]: json({ error: "internal-error" }, 500),
      [GEMINI]: json({ error: { message: "private" } }, 403),
    });

    const out = await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(out).toEqual({ status: "failed" });
    expect(db.resource.updateMany.mock.calls[0]![0].data).toEqual({ title: "The Real Title", author: null });
    expect(embedResourceMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("runYouTubeSummarySweep", () => {
  it("hands recent, settled videos with no article to their own jobs", async () => {
    const db = mockDeep<PrismaClient>();
    const now = new Date("2026-11-06T12:00:00Z");
    db.resource.findMany.mockResolvedValue([
      { id: "yt", url: WATCH },
      // `contains: "youtube.com"` also matches this; the id parser drops it.
      { id: "lookalike", url: "https://notyoutube.com/x" },
    ] as never);
    const trigger = vi.fn().mockResolvedValue(undefined);

    const result = await runYouTubeSummarySweep(db, { trigger, now });

    expect(result).toEqual({ candidates: 1 });
    expect(trigger).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveBeenCalledWith("yt");
    const where = db.resource.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ summary: null, archivedAt: null });
    // Settles for longer than a job can run, so it never pays twice for one article.
    expect(where.createdAt).toEqual({
      gte: new Date("2026-11-06T11:00:00Z"),
      lte: new Date("2026-11-06T11:54:00Z"),
    });
  });
});
