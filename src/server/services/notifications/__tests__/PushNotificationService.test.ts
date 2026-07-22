import { describe, it, expect, vi, beforeEach } from "vitest";

import { PushNotificationService } from "~/server/services/notifications/PushNotificationService";
import { sendPushToUser } from "~/server/services/notifications/WebPushService";

vi.mock("~/server/db", () => ({ db: {} }));
vi.mock("~/server/services/notifications/WebPushService", () => ({
  sendPushToUser: vi.fn(),
}));

function service() {
  return new PushNotificationService({ userId: "u1" });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PushNotificationService", () => {
  it("maps the payload to a push and reports success when an endpoint is reached", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 2, failed: 0 });

    const result = await service().sendNotification({
      title: "Assigned",
      message: "Ship it",
      metadata: { category: "assignment", deeplink: "/w/acme/actions/a1" },
    });

    expect(result.success).toBe(true);
    expect(sendPushToUser).toHaveBeenCalledWith(
      "u1",
      { title: "Assigned", body: "Ship it", tag: "assignment", url: "/w/acme/actions/a1" },
      expect.anything(),
    );
  });

  it("treats no subscriptions (0 sent / 0 failed) as a delivered no-op", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 0, failed: 0 });

    const result = await service().sendNotification({ title: "t", message: "m" });

    expect(result.success).toBe(true);
  });

  it("reports failure when a push endpoint errors (retryable)", async () => {
    vi.mocked(sendPushToUser).mockResolvedValue({ sent: 0, failed: 1 });

    const result = await service().sendNotification({ title: "t", message: "m" });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/failed/i);
  });
});
