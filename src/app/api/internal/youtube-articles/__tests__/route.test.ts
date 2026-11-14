import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { afterQueue, enrichMock } = vi.hoisted(() => ({
  afterQueue: [] as Array<() => unknown>,
  enrichMock: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (cb: () => unknown) => afterQueue.push(cb),
}));
vi.mock("~/server/db", () => ({ db: { marker: "db" } }));
vi.mock("~/server/services/youtubeSummary/enrichYouTubeResource", () => ({
  enrichYouTubeResource: enrichMock,
}));

import { POST } from "../route";

function post(query: string, secret?: string) {
  return POST(
    new NextRequest(`https://app.test/api/internal/youtube-articles${query}`, {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    }),
  );
}

describe("POST /api/internal/youtube-articles", () => {
  beforeEach(() => {
    afterQueue.length = 0;
    enrichMock.mockReset();
    process.env.CRON_SECRET = "s3cret";
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  it("answers at once and does the work after the response", async () => {
    const res = await post("?resourceId=r1", "s3cret");

    expect(res.status).toBe(202);
    expect(enrichMock).not.toHaveBeenCalled();
    await afterQueue[0]!();
    expect(enrichMock).toHaveBeenCalledWith({ marker: "db" }, "r1");
  });

  it("refuses a wrong or missing secret, because a call spends LLM budget", async () => {
    expect((await post("?resourceId=r1", "nope")).status).toBe(401);
    expect((await post("?resourceId=r1")).status).toBe(401);
    expect(afterQueue).toHaveLength(0);
  });

  it("fails closed when no secret is configured", async () => {
    delete process.env.CRON_SECRET;

    expect((await post("?resourceId=r1", "undefined")).status).toBe(401);
  });

  it("needs a resource id", async () => {
    expect((await post("", "s3cret")).status).toBe(400);
  });
});
