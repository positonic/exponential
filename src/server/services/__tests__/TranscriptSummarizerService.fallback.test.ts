/**
 * Provider selection for `summarizeToFirefliesSummary`: Claude first, OpenAI
 * when Claude fails for any reason but a timeout. Both SDKs are stubbed — no
 * model calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { anthropicCreateMock, openAIInvokeMock, openAIConstructorMock } = vi.hoisted(() => ({
  anthropicCreateMock: vi.fn(),
  openAIInvokeMock: vi.fn(),
  openAIConstructorMock: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: anthropicCreateMock };
  },
}));
vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class {
    invoke = openAIInvokeMock;
    constructor(fields: unknown) {
      openAIConstructorMock(fields);
    }
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
    openAIConstructorMock.mockReset();
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

  it("does not fall back when the Claude call hits its deadline", async () => {
    // A real abort: the SDK rejects once the service's deadline signal fires.
    anthropicCreateMock.mockImplementation(
      (_body: unknown, { signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("Request was aborted.")));
        }),
    );
    await expect(
      TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi", { timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(SummarizationTimeoutError);
    expect(openAIInvokeMock).not.toHaveBeenCalled();
  });

  it("hands the fallback only the time Claude left over", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      anthropicCreateMock.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 15_000);
        throw new Error("529 overloaded");
      });
      await TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi", { timeoutMs: 60_000 });
      expect(openAIInvokeMock).toHaveBeenCalledOnce();
      expect(openAIConstructorMock).toHaveBeenCalledWith(
        expect.objectContaining({ timeout: 45_000 }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not fall back when too little of the shared deadline is left", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      anthropicCreateMock.mockImplementation(async () => {
        vi.setSystemTime(Date.now() + 55_000);
        throw new Error("The model returned an invalid summary.");
      });
      await expect(
        TranscriptSummarizerService.summarizeToFirefliesSummary("A: hi", { timeoutMs: 60_000 }),
      ).rejects.toThrow("invalid summary");
      expect(openAIInvokeMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
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
