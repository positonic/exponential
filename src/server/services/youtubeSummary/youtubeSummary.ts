import Anthropic from "@anthropic-ai/sdk";

/**
 * A YouTube video → a short Markdown summary, for Reading-list saves.
 *
 * Two sources, tried in order, so one vendor being blocked by YouTube never
 * stops the feature:
 *
 * 1. **Supadata** fetches the video's own captions (`mode=native`, the cheap
 *    path); Claude Haiku summarises the transcript. The transcript comes back
 *    too, so the Resource gets a readable, indexable body.
 * 2. **Gemini** watches the video from its URL. Google's own access to YouTube,
 *    so it works when captions are missing or the scraper is blocked; it
 *    returns a summary only, no transcript.
 *
 * Every source is optional: an unset key skips it. All network calls go
 * through `deps.fetch` so tests never touch the network.
 */

/** The one URL shape every source accepts, whatever form the user pasted. */
export function canonicalWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export const SUMMARY_MODEL = "claude-haiku-4-5";
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

/**
 * Haiku 4.5 has a 200K-token window. About four characters a token keeps a
 * transcript this long well inside it with room for the prompt; a longer one
 * (a many-hour stream) is cut, and the prompt says so.
 */
export const MAX_TRANSCRIPT_CHARS = 400_000;

const SUMMARY_MAX_TOKENS = 2048;
// Gemini counts its thinking against the output cap, so leave it headroom.
const GEMINI_MAX_OUTPUT_TOKENS = 8192;
const SUPADATA_POLL_MS = 2_000;
const META_TIMEOUT_MS = 5_000;

const SUMMARY_SYSTEM = `You summarise YouTube videos for someone's reading list, so they can decide whether to watch and remember what it said.

Write Markdown in English with exactly two sections:

### Overview
Two or three sentences on what the video is about and its main argument or conclusion.

### Key points
Three to seven bullets, each one concrete takeaway: a claim, a number, a recommendation, a step. Lead each with a few bold words.

Use only what is in the video. Skip greetings, sponsor reads and calls to subscribe. No preamble before the first heading.`;

export interface VideoMeta {
  title: string | null;
  author: string | null;
}

export interface VideoSummary {
  summary: string;
  /** Plain-text captions, when the source returned them (Supadata only). */
  transcript: string | null;
  source: "supadata" | "gemini";
}

export interface YouTubeSummaryDeps {
  fetch: typeof fetch;
  /** Null when no ANTHROPIC_API_KEY is set: the Supadata path needs it. */
  anthropic: Pick<Anthropic, "messages"> | null;
  supadataApiKey: string | null;
  geminiApiKey: string | null;
  geminiModel: string;
}

/** A key from the environment, treating an empty value as unset. */
function envKey(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export function defaultYouTubeSummaryDeps(): YouTubeSummaryDeps {
  return {
    fetch: globalThis.fetch.bind(globalThis),
    anthropic: envKey("ANTHROPIC_API_KEY") ? new Anthropic({ maxRetries: 1 }) : null,
    supadataApiKey: envKey("SUPADATA_API_KEY"),
    geminiApiKey: envKey("GEMINI_API_KEY"),
    geminiModel: envKey("GEMINI_SUMMARY_MODEL") ?? DEFAULT_GEMINI_MODEL,
  };
}

/** Whether any source could run. When false, saving a video does nothing extra. */
export function isYouTubeSummaryConfigured(deps: YouTubeSummaryDeps): boolean {
  const supadata = Boolean(deps.supadataApiKey && deps.anthropic);
  return supadata || Boolean(deps.geminiApiKey);
}

/**
 * Title and channel from YouTube's oEmbed endpoint. Keyless and cheap; a
 * failure only means the Resource keeps the title it was saved with.
 */
export async function fetchVideoMeta(
  watchUrl: string,
  deps: Pick<YouTubeSummaryDeps, "fetch">,
): Promise<VideoMeta | null> {
  try {
    const res = await deps.fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`,
      { signal: AbortSignal.timeout(META_TIMEOUT_MS) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { title?: unknown; author_name?: unknown };
    return {
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : null,
      author:
        typeof body.author_name === "string" && body.author_name.trim()
          ? body.author_name.trim()
          : null,
    };
  } catch {
    return null;
  }
}

/** A source failed in a way worth logging (as opposed to "no captions"). */
export class VideoSourceError extends Error {
  constructor(source: VideoSummary["source"], message: string) {
    super(`[${source}] ${message}`);
    this.name = "VideoSourceError";
  }
}

interface SupadataError {
  error?: string;
  message?: string;
}

/** A transcript response, a 202 job handle, a job poll, or an error body. */
interface SupadataTranscript {
  status?: string;
  content?: unknown;
  /** An error code on a 4xx/5xx; an error object on a failed job. */
  error?: string | SupadataError | null;
  message?: string;
  jobId?: string;
}

function transcriptText(content: unknown): string | null {
  if (typeof content === "string") return content.trim() || null;
  // `text=true` should give a string; tolerate the chunk-array shape too.
  if (Array.isArray(content)) {
    const joined = content
      .map((chunk) =>
        chunk && typeof chunk === "object" && typeof (chunk as { text?: unknown }).text === "string"
          ? (chunk as { text: string }).text
          : "",
      )
      .join(" ")
      .trim();
    return joined || null;
  }
  return null;
}

/**
 * The video's own captions as plain text, via Supadata. Null when the video
 * has none (`transcript-unavailable`): not an error, the next source covers
 * it. Throws on anything else so the caller can log it.
 */
export async function fetchSupadataTranscript(
  watchUrl: string,
  apiKey: string,
  deps: Pick<YouTubeSummaryDeps, "fetch">,
  deadline: number,
): Promise<string | null> {
  const headers = { "x-api-key": apiKey };
  const query = new URLSearchParams({ url: watchUrl, text: "true", mode: "native" });
  const signal = () => AbortSignal.timeout(Math.max(1_000, deadline - Date.now()));

  const res = await deps.fetch(`https://api.supadata.ai/v1/transcript?${query.toString()}`, {
    headers,
    signal: signal(),
  });
  let body = (await res.json().catch(() => ({}))) as SupadataTranscript;

  if (!res.ok) {
    if (body.error === "transcript-unavailable") return null;
    throw new VideoSourceError(
      "supadata",
      `${res.status} ${typeof body.error === "string" ? body.error : ""} ${body.message ?? ""}`.trim(),
    );
  }

  // 202: a long video is processed as a job; poll until it lands or time's up.
  if (res.status === 202 && typeof body.jobId === "string") {
    const jobUrl = `https://api.supadata.ai/v1/transcript/${encodeURIComponent(body.jobId)}`;
    for (;;) {
      if (Date.now() + SUPADATA_POLL_MS >= deadline) {
        throw new VideoSourceError("supadata", "transcript job did not finish in time");
      }
      await new Promise((resolve) => setTimeout(resolve, SUPADATA_POLL_MS));
      const poll = await deps.fetch(jobUrl, { headers, signal: signal() });
      body = (await poll.json().catch(() => ({}))) as SupadataTranscript;
      if (body.status === "completed") break;
      if (body.status === "failed") {
        const err = typeof body.error === "object" ? body.error : null;
        if (err?.error === "transcript-unavailable") return null;
        throw new VideoSourceError("supadata", `job failed: ${err?.message ?? "unknown"}`);
      }
    }
  }

  return transcriptText(body.content);
}

/** Claude Haiku turns a transcript into the reading-list summary. */
export async function summarizeTranscript(
  anthropic: Pick<Anthropic, "messages">,
  title: string,
  transcript: string,
): Promise<string> {
  const truncated = transcript.length > MAX_TRANSCRIPT_CHARS;
  const text = truncated ? transcript.slice(0, MAX_TRANSCRIPT_CHARS) : transcript;

  const response = await anthropic.messages.create({
    model: SUMMARY_MODEL,
    max_tokens: SUMMARY_MAX_TOKENS,
    system: SUMMARY_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Video title: ${title}\n\n<transcript${truncated ? ' note="only the first part of a very long video"' : ""}>\n${text}\n</transcript>`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new VideoSourceError("supadata", "the summary model declined this transcript");
  }
  const summary = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")
    .trim();
  if (!summary) throw new VideoSourceError("supadata", "the summary model returned no text");
  return summary;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown; thought?: unknown }> } }>;
  error?: { message?: string };
}

/** Gemini watches the (public) video and writes the summary itself. */
export async function summarizeWithGemini(
  watchUrl: string,
  title: string,
  apiKey: string,
  model: string,
  deps: Pick<YouTubeSummaryDeps, "fetch">,
  deadline: number,
): Promise<string> {
  const res = await deps.fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(Math.max(1_000, deadline - Date.now())),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SUMMARY_SYSTEM }] },
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri: watchUrl } },
              { text: `Summarise this video. Its title is: ${title}` },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
          // A summary needs what is said, not frame detail; low resolution
          // cuts the video's token cost several-fold.
          mediaResolution: "MEDIA_RESOLUTION_LOW",
        },
      }),
    },
  );
  const body = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok) {
    throw new VideoSourceError("gemini", `${res.status} ${body.error?.message ?? ""}`.trim());
  }
  const summary = (body.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => part.thought !== true && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("")
    .trim();
  if (!summary) throw new VideoSourceError("gemini", "no summary text in the response");
  return summary;
}

/**
 * Summary for a video, from the first source that works. Null when no source
 * is configured or every configured one failed; each failure is logged here
 * so callers only decide what to write.
 */
export async function summarizeYouTubeVideo(
  watchUrl: string,
  title: string,
  deps: YouTubeSummaryDeps,
  deadline: number,
): Promise<VideoSummary | null> {
  if (deps.supadataApiKey && deps.anthropic) {
    try {
      const transcript = await fetchSupadataTranscript(watchUrl, deps.supadataApiKey, deps, deadline);
      if (transcript) {
        const summary = await summarizeTranscript(deps.anthropic, title, transcript);
        return { summary, transcript, source: "supadata" };
      }
    } catch (error) {
      console.warn(`[youtubeSummary] Supadata path failed for ${watchUrl}:`, error);
    }
  }

  if (deps.geminiApiKey) {
    try {
      const summary = await summarizeWithGemini(
        watchUrl,
        title,
        deps.geminiApiKey,
        deps.geminiModel,
        deps,
        deadline,
      );
      return { summary, transcript: null, source: "gemini" };
    } catch (error) {
      console.warn(`[youtubeSummary] Gemini fallback failed for ${watchUrl}:`, error);
    }
  }

  return null;
}
