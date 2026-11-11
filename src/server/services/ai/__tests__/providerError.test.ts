import { describe, it, expect } from "vitest";

import {
  agentErrorTraceContext,
  classifyProviderError,
  isNonRetryableProviderError,
} from "../providerError";

describe("classifyProviderError", () => {
  it("recognises Anthropic credit exhaustion (reported as a 400 invalid_request_error)", () => {
    // Verbatim from the 2026-10-07 incident (Railway logs for mastra).
    const raw =
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
    expect(classifyProviderError(raw)).toBe("billing");
  });

  it("recognises OpenAI quota exhaustion", () => {
    expect(
      classifyProviderError("You exceeded your current quota, please check your plan and billing details."),
    ).toBe("billing");
    expect(classifyProviderError("insufficient_quota")).toBe("billing");
  });

  it("recognises auth failures", () => {
    expect(classifyProviderError("authentication_error: invalid x-api-key")).toBe("auth");
    expect(classifyProviderError("Incorrect API key provided: sk-***")).toBe("auth");
    expect(classifyProviderError("401 Unauthorized")).toBe("auth");
  });

  it("recognises rate limits and overloads as transient", () => {
    expect(classifyProviderError("rate_limit_error: Number of request tokens has exceeded")).toBe("rate-limit");
    expect(classifyProviderError("429 Too Many Requests")).toBe("rate-limit");
    expect(classifyProviderError("overloaded_error: Overloaded")).toBe("overloaded");
  });

  it("falls back to unknown for everything else", () => {
    expect(classifyProviderError("Type validation failed: Value: {...}")).toBe("unknown");
    expect(classifyProviderError("")).toBe("unknown");
  });

  it("prefers billing over auth when a message mentions both", () => {
    expect(classifyProviderError("403 permission_error: purchase credits to continue")).toBe("billing");
  });
});

describe("isNonRetryableProviderError", () => {
  it("marks billing and auth as not worth a Sonnet retry", () => {
    expect(isNonRetryableProviderError("billing")).toBe(true);
    expect(isNonRetryableProviderError("auth")).toBe(true);
  });

  it("keeps the retry for transient and unknown kinds", () => {
    expect(isNonRetryableProviderError("rate-limit")).toBe(false);
    expect(isNonRetryableProviderError("overloaded")).toBe(false);
    expect(isNonRetryableProviderError("unknown")).toBe(false);
  });
});

describe("agentErrorTraceContext", () => {
  const at = new Date("2026-10-15T11:31:48Z");

  it("names the run and gives a log query bounded to a few minutes around it", () => {
    const context = agentErrorTraceContext("ce9543c3-12a8-4c93-810b-f404b65d3b84", at);

    expect(context.occurredAt).toBe("2026-10-15T11:31:48.000Z");
    expect(context.mastraRunId).toBe("ce9543c3-12a8-4c93-810b-f404b65d3b84");
    expect(context.mastraLogs).toBe(
      "railway logs --service mastra --since 2026-10-15T11:29:48.000Z --until 2026-10-15T11:33:48.000Z -n 5000 | grep -B2 -A60 ce9543c3-12a8-4c93-810b-f404b65d3b84",
    );
  });

  it("still gives the time-window query when the chunk carried no run id", () => {
    const context = agentErrorTraceContext(undefined, at);

    expect(context).not.toHaveProperty("mastraRunId");
    expect(context.mastraLogs).not.toContain("grep");
  });

  it("fits the ticket body's per-value cap", () => {
    const context = agentErrorTraceContext("ce9543c3-12a8-4c93-810b-f404b65d3b84", at);
    expect(context.mastraLogs!.length).toBeLessThanOrEqual(200);
  });
});
