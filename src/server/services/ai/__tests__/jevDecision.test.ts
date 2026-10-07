import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  buildJevState,
  decideTierWithJev,
  readTimeoutMsFromEnv,
  resetJevCircuitBreaker,
  JEV_MIN_CONFIDENCE,
} from "../jevDecision";

// ── Fakes ─────────────────────────────────────────────────────────────

type FetchImpl = typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function choiceBody(choice: string, confidence: number) {
  return {
    model: "jev-1.13.0",
    answers: {
      tier: {
        type: "choice",
        choice,
        confidence,
        probabilities: { fast: choice === "fast" ? confidence : 1 - confidence, deep: choice === "deep" ? confidence : 1 - confidence },
      },
    },
    usage: { input_tokens: 120, output_tokens: 8 },
  };
}

const input = {
  message: "what's on my calendar today?",
  priorTurns: [
    { role: "user", content: "hi" },
    { role: "assistant", content: "Hey! What's up?" },
  ],
};

const base = { apiKey: "ts_test_key", timeoutMs: 500 };

beforeEach(() => {
  resetJevCircuitBreaker();
  vi.restoreAllMocks();
});

// ── Happy path ────────────────────────────────────────────────────────

describe("decideTierWithJev — request shape", () => {
  it("POSTs a single choice question with the bearer key and returns the decision", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(choiceBody("fast", 0.93)));
    const result = await decideTierWithJev(input, { ...base, fetchImpl });

    expect(result).toMatchObject({ tier: "fast", confidence: 0.93, model: "jev-1.13.0" });
    expect(result?.latencyMs).toBeGreaterThanOrEqual(0);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ts_test_key");

    const body = JSON.parse(init?.body as string) as {
      model: string;
      state: string;
      questions: Record<string, { type: string; criteria: Record<string, unknown> }>;
    };
    expect(body.model).toBe("jev-latest");
    expect(body.state).toContain("LATEST user message:\nwhat's on my calendar today?");
    expect(body.state).toContain("User: hi");
    expect(body.questions.tier?.type).toBe("choice");
    expect(Object.keys(body.questions.tier?.criteria ?? {})).toEqual(["fast", "deep"]);
  });

  it("returns deep for a deep answer", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(choiceBody("deep", 0.81)));
    const result = await decideTierWithJev(input, { ...base, fetchImpl });
    expect(result?.tier).toBe("deep");
  });
});

// ── Every way it must fall back to null ───────────────────────────────

describe("decideTierWithJev — fallback to null", () => {
  it("is a no-op without an API key", async () => {
    const fetchImpl = vi.fn<FetchImpl>();
    const prev = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(await decideTierWithJev(input, { fetchImpl })).toBeNull();
    } finally {
      if (prev !== undefined) process.env.TYPESAFE_API_KEY = prev;
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null below the confidence floor", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      jsonResponse(choiceBody("deep", JEV_MIN_CONFIDENCE - 0.01)),
    );
    expect(await decideTierWithJev(input, { ...base, fetchImpl })).toBeNull();
  });

  it("acts exactly at the confidence floor", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      jsonResponse(choiceBody("deep", JEV_MIN_CONFIDENCE)),
    );
    expect((await decideTierWithJev(input, { ...base, fetchImpl }))?.tier).toBe("deep");
  });

  it("returns null on a malformed body", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({ answers: { tier: { choice: "medium" } } }));
    expect(await decideTierWithJev(input, { ...base, fetchImpl })).toBeNull();
  });

  it("returns null on a 5xx without tripping the breaker", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({ error: "boom" }, 503));
    expect(await decideTierWithJev(input, { ...base, fetchImpl })).toBeNull();
    expect(await decideTierWithJev(input, { ...base, fetchImpl })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("returns null when fetch throws", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => {
      throw new Error("ECONNRESET");
    });
    expect(await decideTierWithJev(input, { ...base, fetchImpl })).toBeNull();
  });

  it("returns null on timeout and aborts the request", async () => {
    const fetchImpl = vi.fn<FetchImpl>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const result = await decideTierWithJev(input, { ...base, fetchImpl, timeoutMs: 20 });
    expect(result).toBeNull();
  });
});

// ── Circuit breaker ───────────────────────────────────────────────────

describe("decideTierWithJev — auth circuit breaker", () => {
  it("stops calling TypeSafe for the cooldown after a 401", async () => {
    let t = 1_000_000;
    const now = () => t;
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse({ error: "bad key" }, 401));

    expect(await decideTierWithJev(input, { ...base, fetchImpl, now })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    t += 60_000; // 1 min later: still inside the 10 min cooldown
    expect(await decideTierWithJev(input, { ...base, fetchImpl, now })).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    t += 10 * 60_000; // past the cooldown: tries again
    await decideTierWithJev(input, { ...base, fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

// ── State construction ────────────────────────────────────────────────

describe("buildJevState", () => {
  it("keeps only the last six prior turns and truncates long ones", () => {
    const priorTurns = Array.from({ length: 10 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `turn ${i} ${"x".repeat(1000)}`,
    }));
    const state = buildJevState({ message: "now", priorTurns });
    expect(state).not.toContain("turn 3 ");
    expect(state).toContain("turn 4 ");
    expect(state).toContain("turn 9 ");
    // 400 chars + ellipsis per prior turn
    for (const line of state.split("\n").filter((l) => /^(User|Zoe): turn/.test(l))) {
      expect(line.length).toBeLessThanOrEqual("User: ".length + 400 + 1);
      expect(line.endsWith("…")).toBe(true);
    }
    expect(state.endsWith("LATEST user message:\nnow")).toBe(true);
  });

  it("drops system messages and omits the history header when there is none", () => {
    const state = buildJevState({
      message: "hi",
      priorTurns: [{ role: "system", content: "You are Zoe" }],
    });
    expect(state).toBe("LATEST user message:\nhi");
  });
});

// ── Timeout env parsing ───────────────────────────────────────────────

describe("readTimeoutMsFromEnv", () => {
  it("uses the default when the variable is unset or blank", () => {
    expect(readTimeoutMsFromEnv(undefined)).toBe(800);
    expect(readTimeoutMsFromEnv("")).toBe(800);
    expect(readTimeoutMsFromEnv("   ")).toBe(800);
  });

  it("uses the default for non-numeric, zero, negative or infinite values", () => {
    expect(readTimeoutMsFromEnv("abc")).toBe(800);
    expect(readTimeoutMsFromEnv("0")).toBe(800);
    expect(readTimeoutMsFromEnv("-5")).toBe(800);
    expect(readTimeoutMsFromEnv("Infinity")).toBe(800);
  });

  it("accepts a positive number", () => {
    expect(readTimeoutMsFromEnv("1200")).toBe(1200);
    expect(readTimeoutMsFromEnv("250.5")).toBe(250.5);
  });

  it("does not silently disable Jev when the env value is garbage", async () => {
    const prev = process.env.TYPESAFE_TIER_TIMEOUT_MS;
    process.env.TYPESAFE_TIER_TIMEOUT_MS = "not-a-number";
    try {
      // A fetch that takes 30 ms would be killed by a 0/NaN timer but not by the 800 ms default.
      const fetchImpl = vi.fn<FetchImpl>(
        () => new Promise((resolve) => setTimeout(() => resolve(jsonResponse(choiceBody("fast", 0.9))), 30)),
      );
      const result = await decideTierWithJev(input, { apiKey: "ts_test_key", fetchImpl });
      expect(result?.tier).toBe("fast");
    } finally {
      if (prev === undefined) delete process.env.TYPESAFE_TIER_TIMEOUT_MS;
      else process.env.TYPESAFE_TIER_TIMEOUT_MS = prev;
    }
  });
});
