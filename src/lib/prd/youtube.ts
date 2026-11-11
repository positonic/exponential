/**
 * YouTube URL handling for the `youtube` embed node. Pure, so the node, the
 * public sanitizer and the insert prompt all agree on what counts as a video.
 *
 * The node stores only a validated video id and an optional start second;
 * every URL it emits (the iframe `src`, the Markdown projection) is rebuilt
 * from those two values, never copied from user input.
 */

/** A YouTube video id: 11 characters from the URL-safe base64 alphabet. */
export const YOUTUBE_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

export interface YouTubeVideo {
  videoId: string;
  /** Start offset in whole seconds; omitted when the video starts at 0. */
  start?: number;
}

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Path prefixes whose next segment is the video id. */
const ID_PATH_PREFIXES = ["embed", "shorts", "live", "v"];

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds; anything else → undefined. */
export function parseYouTubeStart(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return seconds > 0 ? seconds : undefined;
  }
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  if (!match) return undefined;
  const [, h, m, s] = match;
  const seconds = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Parse a YouTube watch / share / shorts / embed / live URL. Returns null for
 * anything that is not a recognisable link to a single video. A missing
 * scheme is tolerated (`youtube.com/watch?v=…`), as linkify produces those.
 */
export function parseYouTubeUrl(input: string): YouTubeVideo | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  let videoId: string | undefined;
  if (host === "youtu.be" || host === "www.youtu.be") {
    videoId = segments[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") {
      videoId = url.searchParams.get("v") ?? undefined;
    } else if (segments[0] && ID_PATH_PREFIXES.includes(segments[0])) {
      videoId = segments[1];
    }
  }
  if (!videoId || !YOUTUBE_VIDEO_ID_RE.test(videoId)) return null;

  const start = parseYouTubeStart(
    url.searchParams.get("t") ?? url.searchParams.get("start"),
  );
  return start ? { videoId, start } : { videoId };
}

/** The canonical watch URL, used as the node's Markdown projection. */
export function youTubeWatchUrl({ videoId, start }: YouTubeVideo): string {
  return `https://www.youtube.com/watch?v=${videoId}${start ? `&t=${start}s` : ""}`;
}

/**
 * The privacy-enhanced embed URL (no cookies until the visitor plays). The
 * CSP `frame-src` in `next.config.js` allows this host.
 */
export function youTubeEmbedUrl({ videoId, start }: YouTubeVideo): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}${start ? `?start=${start}` : ""}`;
}

/** Coerce stored node attributes back into a video, or null if they are not valid. */
export function youTubeVideoFromAttrs(
  attrs: Record<string, unknown> | undefined,
): YouTubeVideo | null {
  const videoId = attrs?.videoId;
  if (typeof videoId !== "string" || !YOUTUBE_VIDEO_ID_RE.test(videoId)) return null;
  const start = attrs?.start;
  return typeof start === "number" && Number.isInteger(start) && start > 0
    ? { videoId, start }
    : { videoId };
}
