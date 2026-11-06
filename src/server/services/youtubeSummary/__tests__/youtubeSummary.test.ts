/**
 * YouTube Reading-list summaries: source order (Supadata + Haiku first,
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
  summarizeYouTubeVideo,
  fetchSupadataTranscript,
  MAX_TRANSCRIPT_CHARS,
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
const SUPADATA = "https://api.supadata.ai/v1/transcript";
const GEMINI = "https://generativelanguage.googleapis.com/";

function anthropicReturning(text: string) {
  const create = vi.fn().mockResolvedValue({
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
  });
  return { create, client: { messages: { create } } as unknown as YouTubeSummaryDeps["anthropic"] };
}

function deps(overrides: Partial<YouTubeSummaryDeps> = {}): YouTubeSummaryDeps {
  return {
    fetch: fakeFetch({}),
    anthropic: anthropicReturning("### Overview\nFrom captions.").client,
    supadataApiKey: "sd-key",
    geminiApiKey: "gm-key",
    geminiModel: "gemini-test",
    ...overrides,
  };
}

const geminiOk = json({
  candidates: [{ content: { parts: [{ text: "thinking…", thought: true }, { text: "### Overview\nFrom Gemini." }] } }],
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

describe("summarizeYouTubeVideo", () => {
  const deadline = () => Date.now() + 30_000;

  it("summarises the captions with Haiku when Supadata has them, and never calls Gemini", async () => {
    const { create, client } = anthropicReturning("### Overview\nFrom captions.");
    const fetch = fakeFetch({ [SUPADATA]: json({ content: "hello world transcript", lang: "en" }) });

    const out = await summarizeYouTubeVideo(WATCH, "A talk", deps({ fetch, anthropic: client }), deadline());

    expect(out).toEqual({ summary: "### Overview\nFrom captions.", transcript: "hello world transcript", source: "supadata" });
    const supadataCall = fetch.mock.calls[0]!;
    expect(String(supadataCall[0])).toContain("mode=native");
    expect((supadataCall[1]?.headers as Record<string, string>)["x-api-key"]).toBe("sd-key");
    expect(create.mock.calls[0]![0]).toMatchObject({ model: "claude-haiku-4-5" });
    expect(fetch.mock.calls.some(([u]) => String(u).startsWith(GEMINI))).toBe(false);
  });

  it("falls back to Gemini when the video has no captions", async () => {
    const fetch = fakeFetch({
      [SUPADATA]: json({ error: "transcript-unavailable", message: "none" }, 404),
      [GEMINI]: geminiOk,
    });

    const out = await summarizeYouTubeVideo(WATCH, "A talk", deps({ fetch }), deadline());

    expect(out).toEqual({ summary: "### Overview\nFrom Gemini.", transcript: null, source: "gemini" });
    const geminiCall = fetch.mock.calls.find(([u]) => String(u).startsWith(GEMINI))!;
    expect(String(geminiCall[0])).toContain("models/gemini-test:generateContent");
    const body = JSON.parse(String(geminiCall[1]?.body)) as {
      contents: Array<{ parts: Array<{ fileData?: { fileUri: string } }> }>;
    };
    expect(body.contents[0]!.parts[0]!.fileData?.fileUri).toBe(WATCH);
  });

  it("falls back to Gemini when Supadata errors (blocked, out of credit)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = fakeFetch({
      [SUPADATA]: json({ error: "limit-exceeded", message: "quota" }, 429),
      [GEMINI]: geminiOk,
    });

    const out = await summarizeYouTubeVideo(WATCH, "A talk", deps({ fetch }), deadline());

    expect(out?.source).toBe("gemini");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("goes straight to Gemini when there is no Anthropic key", async () => {
    const fetch = fakeFetch({ [GEMINI]: geminiOk });

    const out = await summarizeYouTubeVideo(WATCH, "A talk", deps({ fetch, anthropic: null }), deadline());

    expect(out?.source).toBe("gemini");
    expect(fetch.mock.calls.some(([u]) => String(u).startsWith(SUPADATA))).toBe(false);
  });

  it("returns null when every source fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetch = fakeFetch({
      [SUPADATA]: json({ error: "internal-error" }, 500),
      [GEMINI]: json({ error: { message: "video is private" } }, 400),
    });

    expect(await summarizeYouTubeVideo(WATCH, "A talk", deps({ fetch }), deadline())).toBeNull();
    warn.mockRestore();
  });

  it("cuts a transcript past the model's window and says so in the prompt", async () => {
    const { create, client } = anthropicReturning("ok");
    const long = "word ".repeat(MAX_TRANSCRIPT_CHARS / 4);
    const fetch = fakeFetch({ [SUPADATA]: json({ content: long }) });

    await summarizeYouTubeVideo(WATCH, "Stream", deps({ fetch, anthropic: client }), deadline());

    const prompt = (create.mock.calls[0]![0] as { messages: Array<{ content: string }> }).messages[0]!.content;
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
    summary: null,
  };

  it("writes the real title, summary and transcript, conditional on no summary yet", async () => {
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    const fetch = fakeFetch({
      [OEMBED]: json({ title: "The Real Title", author_name: "A Channel" }),
      [SUPADATA]: json({ content: "one two three" }),
    });

    const out = await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(out).toEqual({ status: "summarized", source: "supadata" });
    const call = db.resource.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "r1", summary: null });
    expect(call.data).toMatchObject({
      title: "The Real Title",
      author: "A Channel",
      summary: "### Overview\nFrom captions.",
      contentType: "video",
      content: "one two three",
      wordCount: 3,
    });
    // Capturing a body never implies indexing it (D-0026).
    expect(embedResourceMock).not.toHaveBeenCalled();
  });

  it("embeds the transcript only when the save asked for embeddings", async () => {
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    const fetch = fakeFetch({ [OEMBED]: json({}), [SUPADATA]: json({ content: "one two three" }) });

    await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }), embed: true });

    expect(embedResourceMock).toHaveBeenCalledWith("r1");
  });

  it("keeps a title the person typed", async () => {
    db.resource.findUnique.mockResolvedValue({ ...savedLink, title: "For Monday" } as never);
    const fetch = fakeFetch({ [OEMBED]: json({ title: "The Real Title" }), [SUPADATA]: json({ content: "x" }) });

    await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(db.resource.updateMany.mock.calls[0]![0].data).toMatchObject({ title: "For Monday" });
  });

  it("leaves an already-summarised row alone without calling any vendor", async () => {
    db.resource.findUnique.mockResolvedValue({ ...savedLink, summary: "done" } as never);
    const fetch = fakeFetch({});

    const out = await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(out).toEqual({ status: "skipped", reason: "already_summarized" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does nothing when no source is configured", async () => {
    const out = await enrichYouTubeResource(db, "r1", {
      deps: deps({ supadataApiKey: null, geminiApiKey: null }),
    });

    expect(out).toEqual({ status: "skipped", reason: "not_configured" });
    expect(db.resource.findUnique).not.toHaveBeenCalled();
  });

  it("still saves the real title when every source fails, and never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    db.resource.findUnique.mockResolvedValue(savedLink as never);
    const fetch = fakeFetch({
      [OEMBED]: json({ title: "The Real Title" }),
      [SUPADATA]: json({ error: "internal-error" }, 500),
      [GEMINI]: json({ error: { message: "private" } }, 403),
    });

    const out = await enrichYouTubeResource(db, "r1", { deps: deps({ fetch }) });

    expect(out).toEqual({ status: "failed" });
    expect(db.resource.updateMany.mock.calls[0]![0].data).toEqual({ title: "The Real Title", author: null });
    warn.mockRestore();
  });
});

describe("runYouTubeSummarySweep", () => {
  it("retries only recent, settled, unsummarised YouTube rows", async () => {
    const db = mockDeep<PrismaClient>();
    const now = new Date("2026-11-06T12:00:00Z");
    db.resource.findMany.mockResolvedValue([
      { id: "yt", url: WATCH },
      // `contains: "youtube.com"` also matches this; the id parser drops it.
      { id: "lookalike", url: "https://notyoutube.com/x" },
    ] as never);
    db.resource.findUnique.mockResolvedValue({ id: "yt", url: WATCH, title: "x", author: null, summary: null } as never);
    db.resource.updateMany.mockResolvedValue({ count: 1 });
    const fetch = fakeFetch({ [OEMBED]: json({}), [SUPADATA]: json({ content: "captions" }) });

    const result = await runYouTubeSummarySweep(db, { deps: deps({ fetch }), now });

    expect(result).toEqual({ candidates: 1, summarized: 1, failed: 0 });
    const where = db.resource.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({ summary: null, archivedAt: null });
    expect(where.createdAt).toEqual({
      gte: new Date("2026-11-06T10:00:00Z"),
      lte: new Date("2026-11-06T11:57:00Z"),
    });
  });
});
