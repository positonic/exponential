import { TRPCError } from "@trpc/server";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { extractOutputs, createCaller } = vi.hoisted(() => {
  const extractOutputs = vi.fn();
  return { extractOutputs, createCaller: vi.fn(() => ({ transcription: { extractOutputs } })) };
});

vi.mock("~/server/api/root", () => ({ createCaller }));
vi.mock("~/server/api/trpc", () => ({ createTRPCContext: vi.fn(async () => ({})) }));

import { maxDuration, POST } from "../route";

const post = (body: unknown, contentType = "application/json") =>
  POST(
    new NextRequest("http://localhost/api/meetings/extract-outputs", {
      method: "POST",
      headers: { "content-type": contentType },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

describe("POST /api/meetings/extract-outputs", () => {
  beforeEach(() => {
    extractOutputs.mockReset();
  });

  it("gives the extraction longer than the shared tRPC route's 60 seconds", () => {
    expect(maxDuration).toBe(300);
  });

  it("runs the tRPC procedure and returns its result", async () => {
    const result = { extracted: true, actions: { draftCount: 2 }, decisions: { draftCount: 3 } };
    extractOutputs.mockResolvedValue(result);

    const response = await post({ transcriptionId: "t1" });

    expect(extractOutputs).toHaveBeenCalledWith({ transcriptionId: "t1" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
  });

  it("passes the procedure's own refusal through with its status", async () => {
    extractOutputs.mockRejectedValue(new TRPCError({ code: "UNAUTHORIZED", message: "Sign in first" }));

    const response = await post({ transcriptionId: "t1" });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Sign in first" });
  });

  it("refuses a body without a transcription id, and a body that is not JSON", async () => {
    expect((await post({})).status).toBe(400);
    expect((await post("transcriptionId=t1", "text/plain")).status).toBe(415);
    expect(extractOutputs).not.toHaveBeenCalled();
  });
});
