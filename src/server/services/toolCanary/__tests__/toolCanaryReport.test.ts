import { describe, expect, it } from "vitest";

import { summarizeToolError } from "~/lib/chat/toolErrors";
import { buildClientErrorBug } from "~/server/services/clientErrors/clientErrorBug";

import {
  canarySubjects,
  toolCanaryReportSchema,
  type ToolCanaryReport,
  type ToolProbe,
} from "../toolCanaryReport";

// What `authenticatedTrpcCall` throws when the app rejects a tool's payload:
// the text ticket 957's tool produced on every call for six months.
const CONTRACT_ERROR =
  'Request failed: 400 Bad Request - {"error":{"json":{"message":"[\\n  {\\n    \\"code\\": \\"invalid_type\\",\\n    \\"expected\\": \\"string\\",\\n    \\"received\\": \\"undefined\\",\\n    \\"path\\": [\\n      \\"workspaceId\\"\\n    ],\\n    \\"message\\": \\"Required\\"\\n  }\\n]","code":-32600,"data":{"code":"BAD_REQUEST","httpStatus":400,"path":"mastra.queryMeetingContext"}}}}';

function probe(overrides: Partial<ToolProbe> & { name: string }): ToolProbe {
  return { toolId: overrides.name, kind: "read", procedures: ["mastra.x"], status: "ok", ...overrides };
}

function report(tools: ToolProbe[], preflight: ToolCanaryReport["preflight"] = { ok: true }): ToolCanaryReport {
  return {
    version: 1,
    startedAt: "2026-11-17T06:30:00.000Z",
    finishedAt: "2026-11-17T06:30:20.000Z",
    durationMs: 20_000,
    target: { origin: "https://staging.example.test", workspaceId: "ws_fixture" },
    preflight,
    tools,
    counts: {
      total: tools.length,
      ok: tools.filter((tool) => tool.status === "ok").length,
      failed: tools.filter((tool) => tool.status === "failed").length,
      skipped: tools.filter((tool) => tool.status === "skipped").length,
    },
  };
}

describe("canarySubjects", () => {
  it("files a rejected tool under the same title the chat route uses, so both land on one ticket", () => {
    const subjects = canarySubjects(
      report([probe({ name: "queryMeetingContextTool", status: "failed", errorKind: "threw", error: CONTRACT_ERROR })]),
    );
    const subject = subjects.find((candidate) => candidate.key === "tool:queryMeetingContextTool");
    expect(subject).toMatchObject({ state: "failing" });
    if (subject?.state !== "failing") throw new Error("expected a failing subject");

    expect(subject.report.area).toBe("agent-tool");
    expect(subject.report.message).toBe(
      "queryMeetingContextTool: mastra.queryMeetingContext rejected the request (invalid_type at workspaceId)",
    );
    // The chat route reports `new Error(summarizeToolError(name, raw))` with
    // area "agent-tool" and no kind: the ingest's dedup key must be identical.
    const fromChat = buildClientErrorBug({
      area: "agent-tool",
      message: summarizeToolError("queryMeetingContextTool", CONTRACT_ERROR),
      context: { tool: "queryMeetingContextTool", platform: "web" },
    });
    expect(buildClientErrorBug(subject.report).issueId).toBe(fromChat.issueId);
    expect(subject.report.context).toMatchObject({ platform: "tool-canary", target: "https://staging.example.test" });
  });

  it("files an answer that fails the tool's own output schema, without the returned payload", () => {
    const subjects = canarySubjects(
      report([
        probe({
          name: "getTodaysActionsTool",
          status: "failed",
          errorKind: "output-schema",
          error:
            "Tool output validation failed for get-todays-actions. The tool returned invalid output:\n- actions.0.dueDate: Expected string, received null\n\nReturned output: {\"actions\":[{\"name\":\"not found by timeout forbidden\"}]}",
        }),
      ]),
    );
    const subject = subjects.find((candidate) => candidate.key === "tool:getTodaysActionsTool");
    if (subject?.state !== "failing") throw new Error("expected a failing subject");
    expect(subject.report.area).toBe("agent-tool");
    expect(subject.report.message).toBe(
      "getTodaysActionsTool: the app answered, but the answer fails the tool's output schema",
    );
    // Same dedup key as the chat route's report of this fault, which carries
    // only the first line of Mastra's message.
    const fromChat = buildClientErrorBug({
      area: "agent-tool",
      message: summarizeToolError(
        "getTodaysActionsTool",
        "ZodError: output failed its schema: Tool output validation failed for get-todays-actions. The tool returned invalid output:",
      ),
    });
    expect(buildClientErrorBug(subject.report).issueId).toBe(fromChat.issueId);
    expect(subject.report.context?.toolErrorKind).toBe("contract");
    expect(subject.report.context?.rawError).toContain("actions.0.dueDate");
    // Words inside the returned data must not steer the classification, and
    // the data itself must not reach a ticket.
    expect(subject.report.context?.rawError).not.toContain("Returned output");
  });

  it("gathers failures that are not the tool's fault into one subject with a title free of names and counts", () => {
    const subjects = canarySubjects(
      report([
        probe({ name: "a", status: "failed", errorKind: "threw", error: "Request failed: 404 Not Found - {}" }),
        probe({ name: "b", status: "failed", errorKind: "timeout", error: "no answer within 20000ms" }),
        probe({ name: "c", status: "failed", errorKind: "input-schema", error: "Tool input validation failed for c" }),
        probe({ name: "d", status: "failed", errorKind: "threw", error: "No workspaceId available in request context" }),
      ]),
    );
    expect(subjects.filter((subject) => subject.key.startsWith("tool:"))).toEqual([]);
    const unchecked = subjects.find((subject) => subject.key === "unchecked");
    if (unchecked?.state !== "failing") throw new Error("expected a failing subject");
    expect(unchecked.report.area).toBe("tool-canary");
    expect(unchecked.report.message).toBe("the tool canary could not check some tools (fixture, access or timeout)");
    expect(unchecked.report.context?.tools).toBe("a (not-found), b (timeout), c (input-schema), d (unknown)");
  });

  it("marks answered tools, the target and the unchecked bucket ok, and gives skipped tools no subject", () => {
    const subjects = canarySubjects(
      report([probe({ name: "a" }), probe({ name: "w", kind: "write", status: "skipped", reason: "write tool" })]),
    );
    expect(subjects.map((subject) => [subject.key, subject.state])).toEqual([
      ["target", "ok"],
      ["tool:a", "ok"],
      ["unchecked", "ok"],
    ]);
  });

  it("blames only the target when it could not be used: no tool fails and none recovers", () => {
    const subjects = canarySubjects(
      report([probe({ name: "a", status: "skipped", reason: "the target could not be used (auth)" })], {
        ok: false,
        kind: "auth",
        error: "Request failed: 401 Unauthorized",
      }),
    );
    expect(subjects).toHaveLength(1);
    expect(subjects[0]).toMatchObject({
      key: "target",
      state: "failing",
      report: { area: "tool-canary", message: "the tool canary could not use its target (auth)" },
    });
  });
});

describe("toolCanaryReportSchema", () => {
  it("accepts the report shape the assistant service returns", () => {
    expect(toolCanaryReportSchema.safeParse(report([probe({ name: "a", durationMs: 12, embeds: true })])).success).toBe(true);
  });

  it("rejects another version or a missing tool list", () => {
    expect(toolCanaryReportSchema.safeParse({ ...report([]), version: 2 }).success).toBe(false);
    expect(toolCanaryReportSchema.safeParse({ ...report([]), tools: undefined }).success).toBe(false);
  });
});
