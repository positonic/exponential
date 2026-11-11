/**
 * The server-side AI gate: procedures get a typed PRECONDITION_FAILED that
 * says how to turn the feature on; crons and webhooks log one line and skip.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { getOpenAIClient } from "../clients";
import { AiNotConfiguredError, aiConfiguredOrSkip, isAiConfigured, requireAi } from "../requireAi";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("requireAi", () => {
  it("throws a PRECONDITION_FAILED TRPCError naming the feature and the variable to set", () => {
    vi.stubEnv("OPENAI_API_KEY", "");

    let thrown: unknown;
    try {
      requireAi("openai", "Semantic search");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AiNotConfiguredError);
    expect(thrown).toBeInstanceOf(TRPCError);
    expect(thrown).toMatchObject({ code: "PRECONDITION_FAILED", requirement: "openai" });
    expect((thrown as Error).message).toBe(
      "Semantic search needs an OpenAI key, which this install doesn't have. Add OPENAI_API_KEY and restart to turn it on.",
    );
  });

  it("passes when the key is set (exponential.im)", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    expect(() => requireAi("openai")).not.toThrow();
  });

  it("reads the environment on every call, so a key added later takes effect", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(isAiConfigured("anthropic")).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-test");
    expect(isAiConfigured("anthropic")).toBe(true);
  });
});

describe("aiConfiguredOrSkip", () => {
  it("logs exactly one line naming the job and returns false when not configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(aiConfiguredOrSkip("openai", "cron embed-meetings")).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/^\[ai\] cron embed-meetings skipped: .*OPENAI_API_KEY/);
  });

  it("returns true and stays quiet when configured", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(aiConfiguredOrSkip("openai", "cron embed-meetings")).toBe(true);
    expect(log).not.toHaveBeenCalled();
  });
});

describe("getOpenAIClient", () => {
  it("throws the typed error instead of the SDK's constructor error when no key is set", () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    expect(() => getOpenAIClient("Transcription")).toThrow(AiNotConfiguredError);
  });
});
