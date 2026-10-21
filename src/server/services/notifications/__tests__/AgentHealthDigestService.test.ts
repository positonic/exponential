import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("~/server/services/sentry/sentryMatrix", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/server/services/sentry/sentryMatrix")>()),
  postMatrixOpsMessage: vi.fn(() => Promise.resolve(true)),
}));

import { postMatrixOpsMessage } from "~/server/services/sentry/sentryMatrix";
import {
  buildAgentHealthDigest,
  formatAgentHealthDigest,
  normalizeErrorLabel,
  sendAgentHealthDigest,
  type FailedTurnRow,
} from "../AgentHealthDigestService";

const since = new Date("2026-10-14T07:00:00Z");

// The two failures from the 2026-10-15 Zoe incident, as the chat route logs them.
const agentErrorTurn: FailedTurnRow = {
  agentId: "zoe",
  errorMessage: JSON.stringify({
    finishReason: "tool-calls",
    toolErrors: [],
    agentError:
      "messages.7.content.1.server_tool_use.id: String should match pattern '^srvtoolu_[a-zA-Z0-9_]+$'",
  }),
  toolCalls: [
    {
      name: "getProjectContextTool",
      args: "{}",
      isError: true,
      errorCode: "Tool output validation failed for get-project-context. The tool returned invalid output:",
    },
    { name: "getAllProjectsTool", args: "{}" },
  ],
};

const toolOnlyTurn: FailedTurnRow = {
  agentId: "zoe",
  errorMessage: JSON.stringify({ finishReason: "stop", toolErrors: ["x"] }),
  toolCalls: [
    {
      name: "getProjectContextTool",
      args: "{}",
      isError: true,
      errorCode: "Tool output validation failed for get-project-context. The tool returned invalid output:",
    },
  ],
};

describe("normalizeErrorLabel", () => {
  it("collapses numbers so two occurrences of one fault share a label", () => {
    expect(normalizeErrorLabel("messages.7.content.1 bad")).toBe(
      normalizeErrorLabel("messages.12.content.3 bad"),
    );
  });

  it("keeps only the first line and masks credential-like runs", () => {
    const label = normalizeErrorLabel(`Invalid key ${"a".repeat(48)}\nstack…`);
    expect(label).toBe("Invalid key [redacted]");
  });
});

describe("buildAgentHealthDigest", () => {
  it("counts failed turns and ranks turn-level and tool-level errors separately", () => {
    const digest = buildAgentHealthDigest([agentErrorTurn, toolOnlyTurn], 40, since);

    expect(digest.totalTurns).toBe(40);
    expect(digest.failedTurns).toBe(2);
    expect(digest.turnErrors).toEqual([
      {
        label: "[zoe] messages.#.content.#.server_tool_use.id: String should match pattern '^srvtoolu_[a-zA-Z#-#_]+$'",
        count: 1,
      },
    ]);
    expect(digest.toolErrors).toEqual([
      {
        label:
          "getProjectContextTool: Tool output validation failed for get-project-context. The tool returned invalid output:",
        count: 2,
      },
    ]);
  });

  it("reads stream failures and empty responses as turn errors", () => {
    const digest = buildAgentHealthDigest(
      [
        { agentId: null, errorMessage: JSON.stringify({ streamFailed: true, error: "socket hang up" }), toolCalls: null },
        { agentId: "zoe", errorMessage: JSON.stringify({ emptyResponse: true }), toolCalls: null },
      ],
      2,
      since,
    );
    expect(digest.turnErrors.map((e) => e.label).sort()).toEqual([
      "[zoe] empty response (no text from the model)",
      "socket hang up",
    ]);
  });

  it("falls back to the raw text when errorMessage was truncated past valid JSON", () => {
    const digest = buildAgentHealthDigest(
      [{ agentId: "zoe", errorMessage: '{"agentError":"cut off', toolCalls: null }],
      1,
      since,
    );
    expect(digest.turnErrors[0]?.label).toBe('[zoe] {"agentError":"cut off');
  });
});

describe("formatAgentHealthDigest", () => {
  it("leads with the failure rate and escapes error text in the HTML", () => {
    const digest = buildAgentHealthDigest(
      [{ agentId: "zoe", errorMessage: JSON.stringify({ agentError: "<b>bad</b>" }), toolCalls: null }],
      4,
      since,
    );
    const { body, formattedBody } = formatAgentHealthDigest(digest);

    expect(body).toContain("1 of 4 agent turns had errors (25%)");
    expect(body).toContain("1× [zoe] <b>bad</b>");
    expect(formattedBody).toContain("&lt;b&gt;bad&lt;/b&gt;");
    expect(formattedBody).not.toContain("<b>bad</b>");
    // No tool failures, so no empty section heading.
    expect(body).not.toContain("Tool calls that failed");
  });
});

describe("sendAgentHealthDigest", () => {
  const dbMock: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
  const now = new Date("2026-10-15T07:00:00Z");

  beforeEach(() => {
    mockReset(dbMock);
    vi.clearAllMocks();
  });

  it("posts nothing on a clean day", async () => {
    dbMock.aiInteractionHistory.count.mockResolvedValue(25);
    dbMock.aiInteractionHistory.findMany.mockResolvedValue([]);

    const result = await sendAgentHealthDigest(dbMock, now);

    expect(result).toEqual({ posted: false, failedTurns: 0, totalTurns: 25 });
    expect(postMatrixOpsMessage).not.toHaveBeenCalled();
  });

  it("reads the last 24h and posts when anything failed", async () => {
    dbMock.aiInteractionHistory.count.mockResolvedValue(25);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbMock.aiInteractionHistory.findMany.mockResolvedValue([agentErrorTurn] as any);

    const result = await sendAgentHealthDigest(dbMock, now);

    expect(result).toEqual({ posted: true, failedTurns: 1, totalTurns: 25 });
    expect(dbMock.aiInteractionHistory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          createdAt: { gte: new Date("2026-10-14T07:00:00Z"), lt: now },
          hadError: true,
        },
      }),
    );
    expect(postMatrixOpsMessage).toHaveBeenCalledTimes(1);
  });
});
