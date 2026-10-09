import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Slack digests and notifications link back into the app. Production doesn't
 * set NEXT_PUBLIC_APP_URL, so these links must fall back to the public prod
 * URL (via getPublicBaseUrlFromEnv) — never to localhost.
 */

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("~/server/db", () => ({ db: { integration: { findUnique } } }));
vi.mock("~/server/utils/credentialHelper", () => ({
  getDecryptedKey: () => "xoxb-test",
}));

import { FeedbackDigestService } from "~/server/services/notifications/FeedbackDigestService";
import { ThreadScoreDigestService } from "~/server/services/notifications/ThreadScoreDigestService";
import { SlackNotificationService } from "~/server/services/notifications/SlackNotificationService";

const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;

function buttonUrls(blocks: unknown[]): string[] {
  return (blocks as Array<{ type: string; elements?: Array<{ url?: string }> }>)
    .filter((b) => b.type === "actions")
    .flatMap((b) => b.elements ?? [])
    .map((e) => e.url)
    .filter((url): url is string => typeof url === "string");
}

function feedbackBlocks(): unknown[] {
  return FeedbackDigestService.getInstance().formatSlackBlocks({
    period: "daily",
    totalFeedback: 0,
    avgRating: 0,
    ratingBreakdown: [],
    lowRatingAlerts: [],
    topImprovementSuggestions: [],
    newFeatureRequests: 0,
  });
}

function threadScoreBlocks(): unknown[] {
  return ThreadScoreDigestService.getInstance().formatSlackBlocks({
    period: "weekly",
    scoredThreads: 0,
    avgScore: null,
    failureCount: 0,
    laneReport: [],
  });
}

async function slackActionBlocks(): Promise<unknown[]> {
  findUnique.mockResolvedValue({ id: "int-1", credentials: [{ id: "cred-1" }] });
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ ok: true, ts: "1" }),
  } as unknown as Response);
  vi.stubGlobal("fetch", fetchMock);

  const svc = new SlackNotificationService({ userId: "u1", integrationId: "int-1" });
  await svc.sendNotification({
    title: "Your actions",
    message: "3 due today",
    metadata: { actionCount: 3 },
  });

  const init = fetchMock.mock.calls[0]![1] as RequestInit;
  return (JSON.parse(init.body as string) as { blocks: unknown[] }).blocks;
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalPublicAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
});

describe("notification links when NEXT_PUBLIC_APP_URL is unset", () => {
  it("FeedbackDigestService links to the production URL", () => {
    expect(buttonUrls(feedbackBlocks())).toEqual([
      "https://www.exponential.im/admin/feedback",
      "https://www.exponential.im/admin/feature-requests",
    ]);
  });

  it("ThreadScoreDigestService links to the production URL", () => {
    expect(buttonUrls(threadScoreBlocks())).toEqual([
      "https://www.exponential.im/admin/feedback",
    ]);
  });

  it("SlackNotificationService's View All Actions button links to the production URL", async () => {
    expect(buttonUrls(await slackActionBlocks())).toEqual([
      "https://www.exponential.im/act",
    ]);
  });
});

describe("notification links when NEXT_PUBLIC_APP_URL is set", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
  });

  it("FeedbackDigestService uses it, without a doubled slash", () => {
    expect(buttonUrls(feedbackBlocks())).toContain("https://app.example.com/admin/feedback");
  });

  it("ThreadScoreDigestService uses it", () => {
    expect(buttonUrls(threadScoreBlocks())).toEqual(["https://app.example.com/admin/feedback"]);
  });

  it("SlackNotificationService uses it", async () => {
    expect(buttonUrls(await slackActionBlocks())).toEqual(["https://app.example.com/act"]);
  });
});
