import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

const { fileHandledErrorBug, postMatrixOpsMessage } = vi.hoisted(() => ({
  fileHandledErrorBug: vi.fn(),
  postMatrixOpsMessage: vi.fn(),
}));

vi.mock("~/server/utils/reportHandledErrorServer", () => ({ fileHandledErrorBug }));
vi.mock("~/server/services/sentry/sentryMatrix", () => ({
  postMatrixOpsMessage,
  escapeHtml: (text: string) => text,
}));
vi.mock("~/server/services/sentry/SentryBugService", () => ({ resolveBugProductId: () => "prod-bugs" }));

import { applyCanarySubjects, runToolCanaryCheck } from "../ToolCanaryService";
import type { CanarySubject, ToolCanaryReport } from "../toolCanaryReport";

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const NOW = new Date("2026-11-17T06:30:00.000Z");

const failingTool: CanarySubject = {
  key: "tool:queryMeetingContextTool",
  label: "queryMeetingContextTool",
  state: "failing",
  report: { area: "agent-tool", message: "queryMeetingContextTool: mastra.queryMeetingContext rejected the request" },
};
const okTool: CanarySubject = { key: "tool:queryMeetingContextTool", label: "queryMeetingContextTool", state: "ok" };

function ticket(links: Record<string, unknown>) {
  return {
    id: "ticket-1",
    number: 970,
    title: "agent-tool: queryMeetingContextTool",
    links,
    updatedAt: new Date("2026-11-16T00:00:00.000Z"),
    product: { slug: "exponential", workspace: { slug: "exponential" } },
  };
}

beforeEach(() => {
  mockReset(db);
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  postMatrixOpsMessage.mockResolvedValue(true);
  db.ticket.findMany.mockResolvedValue([]);
  db.ticket.updateMany.mockResolvedValue({ count: 1 });
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
});

describe("applyCanarySubjects", () => {
  it("files a newly broken tool once and records that the canary sees it failing; the ingest does the announcing", async () => {
    fileHandledErrorBug.mockResolvedValue({ created: true, ticketId: "ticket-1" });
    db.ticket.findUnique.mockResolvedValue(ticket({ sentryIssueId: "client:agent-tool:abc" }) as never);

    const result = await applyCanarySubjects(db, [failingTool], NOW);

    expect(fileHandledErrorBug).toHaveBeenCalledTimes(1);
    expect(fileHandledErrorBug).toHaveBeenCalledWith(failingTool.report, { heading: "Tool canary" });
    expect(db.ticket.updateMany).toHaveBeenCalledWith({
      where: { id: "ticket-1", updatedAt: new Date("2026-11-16T00:00:00.000Z") },
      data: {
        links: {
          sentryIssueId: "client:agent-tool:abc",
          toolCanary: { key: "tool:queryMeetingContextTool", state: "failing", since: NOW.toISOString() },
        },
      },
    });
    // The creation post is the ingest's; a second one from here would double it.
    expect(postMatrixOpsMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ announced: ["tool:queryMeetingContextTool"], recovered: [] });
  });

  it("a second failing run adds nothing: no post and no write", async () => {
    fileHandledErrorBug.mockResolvedValue({ created: false, ticketId: "ticket-1" });
    db.ticket.findUnique.mockResolvedValue(
      ticket({ toolCanary: { key: "tool:queryMeetingContextTool", state: "failing", since: "2026-11-16T06:30:00.000Z" } }) as never,
    );

    const result = await applyCanarySubjects(db, [failingTool], NOW);

    expect(db.ticket.updateMany).not.toHaveBeenCalled();
    expect(postMatrixOpsMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ announced: [], recovered: [] });
  });

  it("marks a ticket first filed from someone's chat as failing without a second announcement", async () => {
    fileHandledErrorBug.mockResolvedValue({ created: false, ticketId: "ticket-1" });
    db.ticket.findUnique.mockResolvedValue(ticket({ sentryIssueId: "client:agent-tool:abc" }) as never);

    const result = await applyCanarySubjects(db, [failingTool], NOW);

    expect(db.ticket.updateMany).toHaveBeenCalledTimes(1);
    expect(postMatrixOpsMessage).not.toHaveBeenCalled();
    expect(result.announced).toEqual([]);
  });

  it("posts once when a failing tool answers again, and marks the ticket recovered", async () => {
    db.ticket.findMany.mockResolvedValue([
      ticket({ toolCanary: { key: "tool:queryMeetingContextTool", state: "failing", since: "2026-11-16T06:30:00.000Z" } }),
      // Still failing in this run (no ok subject for it): left alone.
      { ...ticket({ toolCanary: { key: "tool:otherTool", state: "failing", since: "x" } }), id: "ticket-2" },
    ] as never);

    const result = await applyCanarySubjects(db, [okTool], NOW);

    expect(db.ticket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId: "prod-bugs", links: { path: ["toolCanary", "state"], equals: "failing" } },
      }),
    );
    expect(db.ticket.updateMany).toHaveBeenCalledTimes(1);
    expect(db.ticket.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ticket-1", updatedAt: new Date("2026-11-16T00:00:00.000Z") },
        data: { links: { toolCanary: { key: "tool:queryMeetingContextTool", state: "recovered", since: NOW.toISOString() } } },
      }),
    );
    expect(postMatrixOpsMessage).toHaveBeenCalledTimes(1);
    expect(postMatrixOpsMessage.mock.calls[0]![0].body).toBe(
      "✅ Tool canary, working again: queryMeetingContextTool\nhttps://app.example.test/w/exponential/products/exponential/tickets/970",
    );
    expect(result).toEqual({ announced: [], recovered: ["tool:queryMeetingContextTool"] });
  });

  it("stays quiet about recovery when another run already claimed it", async () => {
    db.ticket.findMany.mockResolvedValue([
      ticket({ toolCanary: { key: "tool:queryMeetingContextTool", state: "failing", since: "x" } }),
    ] as never);
    db.ticket.updateMany.mockResolvedValue({ count: 0 });

    const result = await applyCanarySubjects(db, [okTool], NOW);

    expect(postMatrixOpsMessage).not.toHaveBeenCalled();
    expect(result.recovered).toEqual([]);
  });

  it("announces once when a tool the canary had seen recover breaks again", async () => {
    fileHandledErrorBug.mockResolvedValue({ created: false, ticketId: "ticket-1" });
    db.ticket.findUnique.mockResolvedValue(
      ticket({ toolCanary: { key: "tool:queryMeetingContextTool", state: "recovered", since: "x" } }) as never,
    );

    const result = await applyCanarySubjects(db, [failingTool], NOW);

    expect(postMatrixOpsMessage).toHaveBeenCalledTimes(1);
    expect(postMatrixOpsMessage.mock.calls[0]![0].body).toContain("failing again: queryMeetingContextTool");
    expect(result.announced).toEqual(["tool:queryMeetingContextTool"]);
  });

  it("does nothing when bug filing is switched off, and does not look for recoveries without an ok subject", async () => {
    fileHandledErrorBug.mockResolvedValue(null);
    const result = await applyCanarySubjects(db, [failingTool], NOW);
    expect(db.ticket.findUnique).not.toHaveBeenCalled();
    expect(db.ticket.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({ announced: [], recovered: [] });
  });

  it("keeps filing the rest when one subject fails to file", async () => {
    fileHandledErrorBug.mockRejectedValueOnce(new Error("db down")).mockResolvedValueOnce({ created: true, ticketId: "ticket-1" });
    db.ticket.findUnique.mockResolvedValue(ticket({}) as never);
    const second: CanarySubject = { ...failingTool, key: "tool:other", label: "other" };

    const result = await applyCanarySubjects(db, [failingTool, second], NOW);

    expect(result.announced).toEqual(["tool:other"]);
  });

  it("masks token-like text before it reaches a ticket", async () => {
    fileHandledErrorBug.mockResolvedValue(null);
    const leaky: CanarySubject = {
      ...failingTool,
      report: { area: "agent-tool", message: "x", context: { rawError: "Authorization: Bearer exp_agent_0123456789abcdefghijklmnopqrstuvwxyzABCDEFGH" } },
    };
    await applyCanarySubjects(db, [leaky], NOW);
    const filed = fileHandledErrorBug.mock.calls[0]![0] as { context: { rawError: string } };
    expect(filed.context.rawError).not.toContain("0123456789abcdefghijklmnop");
  });
});

describe("runToolCanaryCheck", () => {
  const env = { MASTRA_API_URL: "https://mastra.example.test/", TOOL_CANARY_SECRET: "s3cret" };
  const report: ToolCanaryReport = {
    version: 1,
    startedAt: "2026-11-17T06:30:00.000Z",
    finishedAt: "2026-11-17T06:30:20.000Z",
    durationMs: 20_000,
    target: { origin: "https://staging.example.test", workspaceId: "ws_fixture" },
    preflight: { ok: true },
    tools: [
      { name: "a", toolId: "a", kind: "read", procedures: ["mastra.a"], status: "ok" },
      { name: "w", toolId: "w", kind: "write", procedures: ["mastra.w"], status: "skipped", reason: "write tool" },
    ],
    counts: { total: 2, ok: 1, failed: 0, skipped: 1 },
  };
  const respond = (status: number, body: unknown) =>
    vi.fn(() => Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status })));

  it("is off, and calls nothing, until both variables are set", async () => {
    const fetchMock = respond(200, report);
    await expect(runToolCanaryCheck(db, { fetch: fetchMock, env: { MASTRA_API_URL: "https://x" } })).resolves.toMatchObject({
      ran: false,
      skipped: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fileHandledErrorBug).not.toHaveBeenCalled();
  });

  it("calls the assistant service's canary route with the secret and summarises the run", async () => {
    const fetchMock = respond(200, report);
    const result = await runToolCanaryCheck(db, { fetch: fetchMock, env, now: NOW });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://mastra.example.test/api/ops/tool-canary");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-Canary-Secret": "s3cret" });
    expect(result).toMatchObject({
      ran: true,
      counts: { total: 2, ok: 1, failed: 0, skipped: 1 },
      target: "https://staging.example.test",
      failing: [],
      skippedTools: [{ name: "w", reason: "write tool" }],
    });
    expect(result.runnerFailed).toBeUndefined();
  });

  it.each([
    [() => Promise.reject(new Error("fetch failed")), "the assistant service did not answer"],
    [respond(503, { error: "tool canary not configured: set TOOL_CANARY_APP_URL" }), "the assistant service answered 503"],
    [respond(401, { error: "Unauthorized" }), "the assistant service answered 401"],
    [respond(200, "<html>gateway</html>"), "the report could not be read"],
    [respond(200, { version: 2 }), "the report could not be read"],
  ])("files a canary that could not run as its own fault (%#)", async (fetchImpl, why) => {
    fileHandledErrorBug.mockResolvedValue(null);
    const result = await runToolCanaryCheck(db, { fetch: fetchImpl as unknown as typeof fetch, env, now: NOW });

    expect(result).toMatchObject({ ran: true, runnerFailed: why, failing: ["runner"] });
    expect(fileHandledErrorBug).toHaveBeenCalledTimes(1);
    expect(fileHandledErrorBug.mock.calls[0]![0]).toMatchObject({
      area: "tool-canary",
      message: `the tool canary could not run (${why})`,
    });
    // No report, so no tool can be declared working again.
    expect(db.ticket.findMany).not.toHaveBeenCalled();
  });

  it("treats a run already in flight as nothing to do", async () => {
    const result = await runToolCanaryCheck(db, { fetch: respond(409, { error: "busy" }), env });
    expect(result).toMatchObject({ ran: false, skipped: "busy" });
    expect(fileHandledErrorBug).not.toHaveBeenCalled();
  });
});
