import { getPublicBaseUrlFromEnv } from "~/lib/urls";

/**
 * Start a video's article job in its own function. A save's `after()` gets 60
 * seconds on the tRPC route, and writing a long article takes minutes. The job
 * route answers straight away, so this only waits for the handover. Never
 * throws: if the kick is lost, the cron sweep retries.
 */
export async function triggerVideoArticle(resourceId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.warn("[youtubeSummary] CRON_SECRET not set; video articles can't start");
    return;
  }
  const url = new URL("/api/internal/youtube-articles", getPublicBaseUrlFromEnv());
  url.searchParams.set("resourceId", resourceId);
  try {
    const res = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${secret}` } });
    if (!res.ok) console.error(`[youtubeSummary] article kick failed (${res.status})`);
  } catch (error) {
    console.error("[youtubeSummary] article kick failed:", error);
  }
}
