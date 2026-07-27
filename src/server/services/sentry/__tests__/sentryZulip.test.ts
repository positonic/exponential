/**
 * Unit tests for the Sentry → Zulip announcement. Mocks
 * `ZulipNotificationService` so no HTTP/DB happens, and asserts the
 * integration lookup, message shape, and best-effort (no-throw) behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

const { sendNotificationMock, ctorMock } = vi.hoisted(() => ({
  sendNotificationMock: vi.fn(() =>
    Promise.resolve({ success: true, messageId: "1" }),
  ),
  ctorMock: vi.fn(),
}));

vi.mock("~/server/services/notifications/ZulipNotificationService", () => ({
  ZulipNotificationService: class {
    sendNotification = sendNotificationMock;
    constructor(config: unknown) {
      ctorMock(config);
    }
  },
}));

import { notifyZulipOfSentryBug } from "../sentryZulip";

const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();

const base = {
  workspaceId: "ws-1",
  authorId: "errol-id",
  title: "Boom",
  ticketUrl: "https://app.example/w/syntrofi/products/exponential/tickets/t1",
  sentryUrl: "https://sentry.io/issues/42",
};

beforeEach(() => {
  mockReset(dbMock);
  vi.clearAllMocks();
  sendNotificationMock.mockResolvedValue({ success: true, messageId: "1" });
  delete process.env.SENTRY_ZULIP_STREAM;
  delete process.env.SENTRY_ZULIP_TOPIC;
  dbMock.integration.findFirst.mockResolvedValue(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { id: "int-1" } as any,
  );
});

describe("notifyZulipOfSentryBug", () => {
  it("sends a message with the ticket link to the workspace's Zulip integration", async () => {
    await notifyZulipOfSentryBug(dbMock, base);

    expect(dbMock.integration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider: "zulip", status: "ACTIVE", workspaceId: "ws-1" },
      }),
    );
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        integrationId: "int-1",
        additionalConfig: { topic: "Sentry bugs" },
      }),
    );
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = sendNotificationMock.mock.calls[0]![0] as {
      message: string;
    };
    expect(payload.message).toContain(base.ticketUrl);
    expect(payload.message).toContain("[View in Sentry](https://sentry.io/issues/42)");
  });

  it("no-ops when the workspace has no Zulip integration", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null);

    await notifyZulipOfSentryBug(dbMock, base);

    expect(ctorMock).not.toHaveBeenCalled();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("honors SENTRY_ZULIP_STREAM / SENTRY_ZULIP_TOPIC overrides", async () => {
    process.env.SENTRY_ZULIP_STREAM = "errors";
    process.env.SENTRY_ZULIP_TOPIC = "prod";

    await notifyZulipOfSentryBug(dbMock, base);

    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "errors",
        additionalConfig: { topic: "prod" },
      }),
    );
  });

  it("omits the Sentry link when there is no url", async () => {
    await notifyZulipOfSentryBug(dbMock, { ...base, sentryUrl: null });

    const payload = sendNotificationMock.mock.calls[0]![0] as { message: string };
    expect(payload.message).not.toContain("View in Sentry");
  });

  it("never throws when the send fails (best-effort)", async () => {
    sendNotificationMock.mockResolvedValue({ success: false, error: "boom" });
    await expect(notifyZulipOfSentryBug(dbMock, base)).resolves.toBeUndefined();
  });

  it("never throws when the integration lookup rejects", async () => {
    dbMock.integration.findFirst.mockRejectedValue(new Error("db down"));
    await expect(notifyZulipOfSentryBug(dbMock, base)).resolves.toBeUndefined();
  });
});
