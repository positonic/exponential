// @vitest-environment node
/**
 * Route-handler tests for the public newsletter signup: the spam defences and
 * rate limits that sit in front of `requestSubscription` (covered in
 * services/workspaceUpdates/__tests__/subscribe.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const { requestSubscription, checkRateLimit, sendConfirm } = vi.hoisted(() => ({
  requestSubscription: vi.fn(),
  checkRateLimit: vi.fn(),
  sendConfirm: vi.fn(),
}));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/workspaceUpdates/subscribe", () => ({ requestSubscription }));
vi.mock("~/server/services/EmailService", () => ({ sendUpdateSubscribeConfirmEmail: sendConfirm }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit,
}));

import { POST } from "../[workspaceSlug]/subscribe/route";

function post(body: unknown): Promise<Response> {
  const request = new Request("https://app.test/api/updates/acme/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
  return POST(request, { params: Promise.resolve({ workspaceSlug: "acme" }) });
}

const human = { email: "ada@example.com", honeypot: "", elapsedMs: 5000 };

beforeEach(() => {
  requestSubscription.mockReset().mockResolvedValue({ kind: "sent" });
  checkRateLimit.mockReset().mockResolvedValue({ success: true, retryAfterSeconds: 0 });
});

describe("POST /api/updates/[workspaceSlug]/subscribe", () => {
  it("sends a confirmation for a genuine signup", async () => {
    const res = await post(human);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(requestSubscription).toHaveBeenCalledWith(
      expect.anything(),
      { workspaceSlug: "acme", email: "ada@example.com" },
      expect.objectContaining({ sendConfirmation: expect.any(Function) }),
    );
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ name: "update-signup-ip", key: "203.0.113.7" }));
    expect(checkRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ name: "update-signup-email", key: "ada@example.com" }),
    );
  });

  it.each([
    ["the honeypot is filled", { ...human, honeypot: "https://spam.example" }],
    ["it was submitted too fast", { ...human, elapsedMs: 200 }],
    ["it has no fill time", { email: "ada@example.com" }],
  ])("fakes success and sends nothing when %s", async (_label, body) => {
    const res = await post(body);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it("rejects an invalid email", async () => {
    const res = await post({ ...human, email: "not-an-email" });
    expect(res.status).toBe(422);
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it("rate-limits by IP before reading the body", async () => {
    checkRateLimit.mockResolvedValueOnce({ success: false, retryAfterSeconds: 120 });

    const res = await post(human);

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it("rate-limits repeat signups for one address, so the form can't flood an inbox", async () => {
    checkRateLimit
      .mockResolvedValueOnce({ success: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ success: false, retryAfterSeconds: 900 });

    const res = await post(human);

    expect(res.status).toBe(429);
    expect(requestSubscription).not.toHaveBeenCalled();
  });

  it("404s where signups aren't open, and reports a failed send", async () => {
    requestSubscription.mockResolvedValueOnce({ kind: "unavailable" });
    expect((await post(human)).status).toBe(404);

    requestSubscription.mockRejectedValueOnce(new Error("postmark down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await post(human)).status).toBe(502);
    spy.mockRestore();
  });

  it("rejects a malformed body", async () => {
    expect((await post("{not json")).status).toBe(400);
  });
});
