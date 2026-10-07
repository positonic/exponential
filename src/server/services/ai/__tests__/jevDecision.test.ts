import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  buildJevState,
  decideTierWithJev,
  readTimeoutMsFromEnv,
  resetJevCircuitBreaker,
  resolveJevProvider,
  JEV_MIN_CONFIDENCE,
  type JevProvider,
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

const typesafeProvider: JevProvider = {
  name: "typesafe",
  apiKey: "ts_test_key",
  baseUrl: "https://api.typesafe.ai",
  model: "jev-latest",
};
const openrouterProvider: JevProvider = {
  name: "openrouter",
  apiKey: "sk-or-test",
  baseUrl: "https://openrouter.ai/api",
  model: "jev-latest",
};
const base = { provider: typesafeProvider, timeoutMs: 500 };

beforeEach(() => {
  resetJevCircuitBreaker();
  vi.restoreAllMocks();
});

// ── Happy path ────────────────────────────────────────────────────────

describe("decideTierWithJev — request shape", () => {
  it("POSTs a single choice question with the bearer key and returns the decision", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => jsonResponse(choiceBody("fast", 0.93)));
    const result = await decideTierWithJev(input, { ...base, fetchImpl });

    expect(result).toMatchObject({ tier: "fast", confidence: 0.93, model: "jev-1.13.0", provider: "typesafe" });
    expect(result?.costUsd).toBeUndefined();
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
  it("is a no-op when no provider is configured", async () => {
    const fetchImpl = vi.fn<FetchImpl>();
    expect(await decideTierWithJev(input, { provider: null, fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("resolves no provider from an environment without either key", async () => {
    const fetchImpl = vi.fn<FetchImpl>();
    const saved = { or: process.env.OPENROUTER_API_KEY, ts: process.env.TYPESAFE_API_KEY };
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      expect(await decideTierWithJev(input, { fetchImpl })).toBeNull();
    } finally {
      if (saved.or !== undefined) process.env.OPENROUTER_API_KEY = saved.or;
      if (saved.ts !== undefined) process.env.TYPESAFE_API_KEY = saved.ts;
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
      const result = await decideTierWithJev(input, { provider: typesafeProvider, fetchImpl });
      expect(result?.tier).toBe("fast");
    } finally {
      if (prev === undefined) delete process.env.TYPESAFE_TIER_TIMEOUT_MS;
      else process.env.TYPESAFE_TIER_TIMEOUT_MS = prev;
    }
  });
});

// ── Provider resolution ───────────────────────────────────────────────

describe("resolveJevProvider", () => {
  it("returns null when neither key is set", () => {
    expect(resolveJevProvider({})).toBeNull();
  });

  it("prefers OpenRouter when its key is set", () => {
    const p = resolveJevProvider({ OPENROUTER_API_KEY: "sk-or", TYPESAFE_API_KEY: "ts" });
    expect(p).toEqual({
      name: "openrouter",
      apiKey: "sk-or",
      baseUrl: "https://openrouter.ai/api",
      model: "jev-latest",
    });
  });

  it("uses TypeSafe direct when only that key is set", () => {
    const p = resolveJevProvider({ TYPESAFE_API_KEY: "ts" });
    expect(p).toEqual({
      name: "typesafe",
      apiKey: "ts",
      baseUrl: "https://api.typesafe.ai",
      model: "jev-latest",
    });
  });

  it("honours JEV_PROVIDER=typesafe even when the OpenRouter key exists", () => {
    const p = resolveJevProvider({ OPENROUTER_API_KEY: "sk-or", TYPESAFE_API_KEY: "ts", JEV_PROVIDER: "typesafe" });
    expect(p?.name).toBe("typesafe");
  });

  it("returns null when JEV_PROVIDER names a provider whose key is missing", () => {
    expect(resolveJevProvider({ TYPESAFE_API_KEY: "ts", JEV_PROVIDER: "openrouter" })).toBeNull();
  });

  it("falls back to the key-based default on an unknown JEV_PROVIDER", () => {
    expect(resolveJevProvider({ OPENROUTER_API_KEY: "sk-or", JEV_PROVIDER: "banana" })?.name).toBe("openrouter");
  });

  it("applies JEV_MODEL and base URL overrides", () => {
    const p = resolveJevProvider({
      OPENROUTER_API_KEY: "sk-or",
      OPENROUTER_API_URL: "http://localhost:9999/api",
      JEV_MODEL: "typesafe/jev-1.13",
    });
    expect(p?.baseUrl).toBe("http://localhost:9999/api");
    expect(p?.model).toBe("typesafe/jev-1.13");
  });
});

describe("decideTierWithJev — OpenRouter provider", () => {
  it("posts to OpenRouter's System One endpoint with its key and app title, and reads usage.cost", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      jsonResponse({
        ...choiceBody("deep", 0.88),
        model: "typesafe/jev-1.13-20260917",
        provider: "TypeSafe",
        usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
      }),
    );
    const result = await decideTierWithJev(input, { provider: openrouterProvider, fetchImpl, timeoutMs: 500 });

    expect(result).toMatchObject({
      tier: "deep",
      provider: "openrouter",
      model: "typesafe/jev-1.13-20260917",
      costUsd: 0.000019992,
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/systemone");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-or-test");
    expect(headers["X-Title"]).toBe("Exponential");
    expect((JSON.parse(init?.body as string) as { model: string }).model).toBe("jev-latest");
  });
});
