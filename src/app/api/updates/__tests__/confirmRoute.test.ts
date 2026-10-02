// @vitest-environment node
/** The Confirm button's POST: outcome → redirect back to the confirm page. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { confirmSubscription, checkRateLimit } = vi.hoisted(() => ({
  confirmSubscription: vi.fn(),
  checkRateLimit: vi.fn(),
}));
vi.mock("~/server/db", () => ({ db: { __stub: "db" } }));
vi.mock("~/server/services/workspaceUpdates/subscribe", () => ({ confirmSubscription }));
vi.mock("~/server/utils/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/utils/rateLimit")>()),
  checkRateLimit,
}));

import { POST } from "../[workspaceSlug]/confirm/route";

function post(token: string | null): Promise<Response> {
  const form = new FormData();
  if (token !== null) form.set("token", token);
  const request = new NextRequest("https://app.test/api/updates/acme/confirm", { method: "POST", body: form });
  return POST(request, { params: Promise.resolve({ workspaceSlug: "acme" }) });
}

beforeEach(() => {
  confirmSubscription.mockReset();
  checkRateLimit.mockReset().mockResolvedValue({ success: true, retryAfterSeconds: 0 });
});

describe("POST /api/updates/[workspaceSlug]/confirm", () => {
  it.each([
    [{ kind: "subscribed", workspaceSlug: "acme", workspaceName: "Acme", alreadySubscribed: false }, "subscribed"],
    [{ kind: "subscribed", workspaceSlug: "acme", workspaceName: "Acme", alreadySubscribed: true }, "already"],
    [{ kind: "closed", workspaceSlug: "acme", workspaceName: "Acme" }, "closed"],
    [{ kind: "invalid" }, "invalid"],
  ])("redirects with the outcome (%o)", async (result, status) => {
    confirmSubscription.mockResolvedValue(result);

    const res = await post("tok");

    expect(confirmSubscription).toHaveBeenCalledWith(expect.anything(), "tok");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(`https://app.test/updates/acme/confirm?status=${status}`);
  });

  it("sends the visitor to the workspace the token names, not the path's slug", async () => {
    confirmSubscription.mockResolvedValue({
      kind: "subscribed",
      workspaceSlug: "real-ws",
      workspaceName: "Real",
      alreadySubscribed: false,
    });

    const res = await post("tok");

    expect(res.headers.get("location")).toBe("https://app.test/updates/real-ws/confirm?status=subscribed");
  });

  it("treats a missing token as invalid and honours the rate limit", async () => {
    expect((await post(null)).headers.get("location")).toContain("status=invalid");
    expect(confirmSubscription).not.toHaveBeenCalled();

    checkRateLimit.mockResolvedValueOnce({ success: false, retryAfterSeconds: 60 });
    expect((await post("tok")).headers.get("location")).toContain("status=busy");
    expect(confirmSubscription).not.toHaveBeenCalled();
  });
});
