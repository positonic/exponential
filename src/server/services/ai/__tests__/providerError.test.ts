import { describe, it, expect } from "vitest";

import {
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
