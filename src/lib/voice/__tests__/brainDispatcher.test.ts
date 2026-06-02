import { describe, it, expect, vi } from "vitest";

import {
  dispatch,
  BrainDispatchError,
} from "~/lib/voice/brainDispatcher";

/** Build a fake fetch returning the given JSON body + status. */
function fakeFetch(body: unknown, status = 200): typeof fetch {
  return vi.fn(async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) as unknown as Response,
  ) as unknown as typeof fetch;
}

const SUCCESS_BODY = {
  result: { data: { json: { speakable: "Done.", structured: { ok: true }, needsConfirmation: false } } },
};

describe("brainDispatcher.dispatch", () => {
  it("returns the parsed DispatchResult on HTTP 2xx", async () => {
    const fetchImpl = fakeFetch(SUCCESS_BODY);
    const res = await dispatch(
      { toolName: "query", voiceSessionToken: "tok", args: { phrase: "what's overdue?" } },
      { fetchImpl },
    );

    expect(res.speakable).toBe("Done.");
    expect(res.needsConfirmation).toBe(false);
    expect(res.structured).toEqual({ ok: true });
  });

  it("posts the input wrapped as the tRPC {json:...} body", async () => {
    const fetchImpl = fakeFetch(SUCCESS_BODY);
    await dispatch(
      { toolName: "complete_action", voiceSessionToken: "tok", args: { phrase: "x" }, confirm: true, pendingActionId: "a1" },
      { fetchImpl },
    );

    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/trpc/voice.dispatch");
    const sent = JSON.parse((call[1] as RequestInit).body as string) as {
      json: Record<string, unknown>;
    };
    expect(sent.json).toMatchObject({
      token: "tok",
      toolName: "complete_action",
      args: { phrase: "x" },
      confirm: true,
      pendingActionId: "a1",
    });
  });

  it("maps a tRPC UNAUTHORIZED envelope to an `auth` error", async () => {
    const fetchImpl = fakeFetch(
      { error: { json: { message: "Invalid or missing voice-session token", data: { code: "UNAUTHORIZED" } } } },
      401,
    );

    const err = await dispatch({ toolName: "query", voiceSessionToken: "bad" }, { fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrainDispatchError);
    expect((err as BrainDispatchError).kind).toBe("auth");
    expect((err as BrainDispatchError).code).toBe("UNAUTHORIZED");
  });

  it("maps a tRPC BAD_REQUEST envelope to a `validation` error", async () => {
    const fetchImpl = fakeFetch(
      { error: { json: { message: "Invalid input", data: { code: "BAD_REQUEST" } } } },
      400,
    );

    const err = await dispatch({ toolName: "", voiceSessionToken: "tok" }, { fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrainDispatchError);
    expect((err as BrainDispatchError).kind).toBe("validation");
  });

  it("surfaces a transport error when fetch rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const err = await dispatch({ toolName: "query", voiceSessionToken: "tok" }, { fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrainDispatchError);
    expect((err as BrainDispatchError).kind).toBe("transport");
    expect((err as BrainDispatchError).message).toContain("ECONNREFUSED");
  });

  it("raises a decoding error when the body is not a valid tRPC envelope", async () => {
    const fetchImpl = fakeFetch({ unexpected: "shape" }, 200);
    const err = await dispatch({ toolName: "query", voiceSessionToken: "tok" }, { fetchImpl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BrainDispatchError);
    expect((err as BrainDispatchError).kind).toBe("decoding");
  });
});
