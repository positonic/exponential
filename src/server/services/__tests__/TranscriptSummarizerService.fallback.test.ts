/**
 * Provider selection for `summarizeToFirefliesSummary`: Claude first, OpenAI
 * when Claude fails for any reason but a timeout. Both SDKs are stubbed — no
 * model calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { anthropicCreateMock, openAIInvokeMock } = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  openAIInvokeMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreateMock };
  },
}));
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    invoke = openAIInvokeMock;
  },
}));

import {
  TranscriptSummarizerService,
  SummarizationTimeoutError,
} from "../TranscriptSummarizerService";

const SUMMARY_JSON = JSON.stringify({
  overview: "Standup.",
  shorthand_bullet: ["Pipeline outage fixed"],
});

describe("TranscriptSummarizerService.summarizeToFirefliesSummary — provider fallback", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    anthropicCreateMock.mockReset();
    openAIInvokeMock.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.OPENAI_API_KEY = "test-openai";
    openAIInvokeMock.mockResolvedValue({ content: SUMMARY_JSON });
  });
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses Claude when it succeeds", async () => {
    anthropicCreateMock.mockResolvedValue({ content: [{ type: "text", text: SUMMARY_JSON }] });
    const summary = await TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi");
    expect(summary.overview).toBe("Standup.");
    expect(openAIInvokeMock).not.toHaveBeenCalled();
  });

  it("falls back to OpenAI when the Claude call errors (e.g. out of credit)", async () => {
    anthropicCreateMock.mockRejectedValue(new Error("400 credit balance is too low"));
    const summary = await TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi");
    expect(summary.shorthand_bullet).toEqual(["Pipeline outage fixed"]);
    expect(openAIInvokeMock).toHaveBeenCalledOnce();
  });

  it("falls back to OpenAI when Claude returns unparseable output", async () => {
    anthropicCreateMock.mockResolvedValue({ content: [{ type: "text", text: "not json" }] });
    await TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi");
    expect(openAIInvokeMock).toHaveBeenCalledOnce();
  });

  it("does not fall back after a timeout", async () => {
    anthropicCreateMock.mockRejectedValue(new SummarizationTimeoutError(60_000));
    await expect(
      TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi"),
    ).rejects.toBeInstanceOf(SummarizationTimeoutError);
    expect(openAIInvokeMock).not.toHaveBeenCalled();
  });

  it("rethrows the Claude error when no OpenAI key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    anthropicCreateMock.mockRejectedValue(new Error("400 credit balance is too low"));
    await expect(
      TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi"),
    ).rejects.toThrow("credit balance");
    expect(openAIInvokeMock).not.toHaveBeenCalled();
  });
});
