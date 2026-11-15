/**
 * The hosted executor (ADR-0067, Agent PRD D4): atomic claim, persona + brief
 * to the run agent as the shadow user with a runId claim, SUCCEEDED with the
 * agent's text as summary when finish-run was never called, FAILED on a
 * Mastra error, and a second dispatcher is a no-op. Mocked Prisma + fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// The finish hook (notification, activity, time entry) is covered by finish.test.ts.
const finishMock = vi.fn().mockResolvedValue(undefined);
vi.mock("../finish", () => ({ onRunFinished: (...args: unknown[]) => finishMock(...args) }));
const reportHandledErrorServer = vi.hoisted(() => vi.fn());
vi.mock("~/server/utils/reportHandledErrorServer", () => ({ reportHandledErrorServer }));
import jwt from "jsonwebtoken";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.MASTRA_API_URL = "http://mastra.test:4111";
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

const { dispatchQueuedRuns, triggerDispatch, countToolCalls, buildPersonaMessage, buildActionBrief, LOCAL_RUNNER_CLOSING } = await import("../dispatch");
const { assembleScopeInstructions } = await import("~/server/services/ai/scopeInstructions");

const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const RUN = "run-1";
const runRow = {
  id: RUN,
  actionId: "action-1",
  wakeCommentId: null,
  action: {
    id: "action-1",
    name: "Find a venue",
    description: "Somewhere central",
    dueDate: null,
    workspaceId: "ws-1",
    project: { name: "Offsite" },
  },
  agent: {
    id: "agent-1",
    name: "Aria",
    shadowUser: { id: "shadow-1", email: null, name: "Aria", image: null },
    owner: { id: "owner-1", name: "James" },
    assistant: { name: "Aria", emoji: "✨", personality: "Warm.", instructions: null, userContext: null },
  },
  requestedBy: { name: "James" },
  predecessor: null,
};

function mastraReplies(body: unknown, ok = true, status = 200) {
  fetchMock.mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

describe("dispatchQueuedRuns", () => {
  beforeEach(() => {
    mockReset(db);
    fetchMock.mockReset();
    db.agentRun.findMany.mockResolvedValue([{ id: RUN }] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    db.agentRun.findUniqueOrThrow
      .mockResolvedValueOnce(runRow as never)
      .mockResolvedValueOnce({ status: "RUNNING", summary: null, readyToClose: false, toolCallCount: 0 } as never);
    db.agentRun.update.mockResolvedValue({} as never);
  });

  it("claims atomically, calls assistantRunAgent as the shadow user with a runId claim, and finishes SUCCEEDED with the text as summary", async () => {
    mastraReplies({ text: "Found two venues.", steps: [{ toolCalls: [{}, {}] }, { toolCalls: [{}] }], usage: { totalTokens: 10 } });

    const result = await dispatchQueuedRuns(db, new Date("2026-10-10T09:00:00Z"));

    expect(result.claimed).toBe(1);
    expect(result.succeeded).toEqual([RUN]);
    // Claim: QUEUED → RUNNING guarded on status.
    expect(db.agentRun.updateMany.mock.calls[0]?.[0]).toMatchObject({
      where: { id: RUN, status: "QUEUED" },
      data: { status: "RUNNING" },
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe("http://mastra.test:4111/api/agents/assistantRunAgent/generate");
    const body = JSON.parse(init.body) as {
      messages: Array<{ role: string; content: string }>;
      requestContext: Record<string, unknown>;
      memory: { resource: string; thread: { id: string } };
    };
    expect(body.messages[0]).toMatchObject({ role: "system" });
    expect(body.messages[0]!.content).toContain('<user_data type="personality">');
    expect(body.messages[1]!.content).toContain('assigned the action "Find a venue"');
    expect(body.requestContext).toMatchObject({ userId: "shadow-1", ownerUserId: "owner-1", runId: RUN, workspaceId: "ws-1" });
    expect(body.memory).toEqual({ resource: "shadow-1", thread: { id: "action-action-1" } });

    // The token is the shadow user's agent-context JWT carrying the run id.
    const token = init.headers.Authorization.replace("Bearer ", "");
    const claims = jwt.verify(token, process.env.AUTH_SECRET!) as Record<string, unknown>;
    expect(claims).toMatchObject({ userId: "shadow-1", tokenType: "agent-context", runId: RUN });

    // Finish: SUCCEEDED, summary = text, tool count reconciled from steps, never overriding a cancel.
    const finish = db.agentRun.updateMany.mock.calls[1]?.[0];
    expect(finish).toMatchObject({
      where: { id: RUN, status: { in: ["RUNNING", "QUEUED"] } },
      data: { status: "SUCCEEDED", summary: "Found two venues.", toolCallCount: 3 },
    });
  });

  it("keeps the summary finish-run recorded over the agent's text", async () => {
    mockReset(db);
    db.agentRun.findMany.mockResolvedValue([{ id: RUN }] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    db.agentRun.findUniqueOrThrow
      .mockResolvedValueOnce(runRow as never)
      .mockResolvedValueOnce({ status: "RUNNING", summary: "From finish-run", readyToClose: true, toolCallCount: 4 } as never);
    mastraReplies({ text: "chatter", steps: [] });

    await dispatchQueuedRuns(db, new Date());

    expect(db.agentRun.updateMany.mock.calls[1]?.[0]).toMatchObject({
      data: { status: "SUCCEEDED", summary: "From finish-run", readyToClose: true, toolCallCount: 4 },
    });
  });

  it("marks the run FAILED with the error when Mastra errors", async () => {
    mastraReplies({ error: "boom" }, false, 500);

    const result = await dispatchQueuedRuns(db, new Date());

    expect(result.failed).toHaveLength(1);
    expect(db.agentRun.updateMany.mock.calls[1]?.[0]).toMatchObject({
      data: { status: "FAILED", error: expect.stringContaining("500") },
    });
  });

  it("a run cancelled while Mastra worked is reported as cancelled, not succeeded, and not finished again", async () => {
    mockReset(db);
    finishMock.mockClear();
    fetchMock.mockReset();
    db.agentRun.findMany.mockResolvedValue([{ id: RUN }] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    db.agentRun.findUniqueOrThrow
      .mockResolvedValueOnce(runRow as never)
      .mockResolvedValueOnce({ status: "CANCELLED", summary: null, readyToClose: false, toolCallCount: 0 } as never);
    mastraReplies({ text: "late result" });

    const result = await dispatchQueuedRuns(db, new Date());

    expect(result.cancelled).toEqual([RUN]);
    expect(result.succeeded).toEqual([]);
    expect(db.agentRun.updateMany).toHaveBeenCalledTimes(1); // the claim only
    expect(finishMock).not.toHaveBeenCalled();
  });

  it("bounds the Mastra call with a timeout inside the function budget", async () => {
    mastraReplies({ text: "ok" });
    await dispatchQueuedRuns(db, new Date());
    const init = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("a second dispatcher that loses the claim does nothing", async () => {
    db.agentRun.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await dispatchQueuedRuns(db, new Date());

    expect(result.claimed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("metering a run (billing V1)", () => {
  /** Two Sonnet 4.5 steps as Mastra reports them: the second reads the cache the first wrote. */
  const step = (tokens: { noCache: number; cacheRead: number; cacheWrite: number; output: number }) => {
    const total = tokens.noCache + tokens.cacheRead + tokens.cacheWrite;
    return {
      toolCalls: [{}],
      usage: {
        inputTokens: total,
        outputTokens: tokens.output,
        cachedInputTokens: tokens.cacheRead,
        raw: {
          inputTokens: { total, noCache: tokens.noCache, cacheRead: tokens.cacheRead, cacheWrite: tokens.cacheWrite },
          outputTokens: { total: tokens.output },
        },
      },
    };
  };
  const steps = [
    step({ noCache: 1_000, cacheRead: 0, cacheWrite: 20_000, output: 400 }),
    step({ noCache: 500, cacheRead: 20_000, cacheWrite: 2_000, output: 600 }),
  ];
  const RUN_OUTPUT = {
    text: "Found two venues.",
    steps,
    usage: { inputTokens: 43_500, outputTokens: 1_000, cachedInputTokens: 20_000, raw: steps[1]!.usage.raw },
    response: { modelId: "claude-sonnet-4-5-20250929" },
  };
  // 1,500 fresh × $3/M + 20,000 read × $0.30/M + 22,000 written × $3.75/M + 1,000 out × $15/M
  // = 0.0045 + 0.006 + 0.0825 + 0.015
  const RUN_COST_MICROS = 108_000;

  /** The run's own status after Mastra returned. */
  function runEndsAs(status: "RUNNING" | "WAITING_ON_OWNER" | "CANCELLED", run: unknown = runRow) {
    mockReset(db);
    fetchMock.mockReset();
    db.agentRun.findMany.mockResolvedValue([{ id: RUN }] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    db.agentRun.findUniqueOrThrow
      .mockResolvedValueOnce(run as never)
      .mockResolvedValueOnce({ status, summary: null, readyToClose: false, toolCallCount: 0 } as never);
    db.agentRun.update.mockResolvedValue({} as never);
    mastraReplies(RUN_OUTPUT);
  }

  const recordedEvents = () => db.usageEvent.create.mock.calls.map(([args]) => args.data);

  beforeEach(() => {
    process.env.BILLING_MODE = "meter";
  });

  afterEach(() => {
    delete process.env.BILLING_MODE;
  });

  it("records one priced event against the action's workspace, pointing at the run", async () => {
    runEndsAs("RUNNING");

    await dispatchQueuedRuns(db, new Date());

    expect(recordedEvents()).toEqual([
      {
        workspaceId: "ws-1",
        source: "AGENT_RUN",
        modelId: "claude-sonnet-4-5-20250929",
        costMicros: RUN_COST_MICROS,
        onOwnKey: false,
        refId: RUN,
      },
    ]);
    expect(db.workspaceUsagePeriod.upsert.mock.calls[0]?.[0]).toMatchObject({
      create: { workspaceId: "ws-1", costMicros: RUN_COST_MICROS },
      update: { costMicros: { increment: RUN_COST_MICROS } },
    });
  });

  it.each(["WAITING_ON_OWNER", "CANCELLED"] as const)("still meters a run that ends %s: it was paid for", async (status) => {
    runEndsAs(status);

    await dispatchQueuedRuns(db, new Date());

    expect(recordedEvents()).toHaveLength(1);
    expect(recordedEvents()[0]).toMatchObject({ costMicros: RUN_COST_MICROS, refId: RUN });
  });

  it("uses the project's workspace when the action carries none", async () => {
    runEndsAs("RUNNING", {
      ...runRow,
      action: { ...runRow.action, workspaceId: null, project: { name: "Offsite", workspaceId: "ws-project" } },
    });

    await dispatchQueuedRuns(db, new Date());

    expect(recordedEvents()[0]).toMatchObject({ workspaceId: "ws-project" });
  });

  it("prices at the run agent's model when Mastra's reply does not name one", async () => {
    runEndsAs("RUNNING");
    mastraReplies({ ...RUN_OUTPUT, response: undefined });

    await dispatchQueuedRuns(db, new Date());

    expect(recordedEvents()[0]).toMatchObject({ modelId: "claude-sonnet-4-5", costMicros: RUN_COST_MICROS });
  });

  it("records nothing for a run Mastra failed: no usage came back", async () => {
    runEndsAs("RUNNING");
    mastraReplies({ error: "boom" }, false, 500);

    const result = await dispatchQueuedRuns(db, new Date());

    expect(result.failed).toHaveLength(1);
    expect(recordedEvents()).toEqual([]);
  });

  it("a metering failure never fails the run", async () => {
    runEndsAs("RUNNING");
    db.$transaction.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await dispatchQueuedRuns(db, new Date());

    expect(result.succeeded).toEqual([RUN]);
    expect(result.failed).toEqual([]);
    consoleError.mockRestore();
  });

  it("records nothing on an install that does not meter", async () => {
    delete process.env.BILLING_MODE;
    runEndsAs("RUNNING");

    await dispatchQueuedRuns(db, new Date());

    expect(recordedEvents()).toEqual([]);
    expect(db.$transaction).not.toHaveBeenCalled();
  });
});

describe("AI instructions in a run", () => {
  function sentMessages(): Array<{ role: string; content: string }> {
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    return (JSON.parse(init.body) as { messages: Array<{ role: string; content: string }> }).messages;
  }

  beforeEach(() => {
    mockReset(db);
    fetchMock.mockReset();
    reportHandledErrorServer.mockReset();
    db.agentRun.findMany.mockResolvedValue([{ id: RUN }] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    db.agentRun.findUniqueOrThrow
      .mockResolvedValueOnce({ ...runRow, action: { ...runRow.action, projectId: "proj-1" } } as never)
      .mockResolvedValueOnce({ status: "RUNNING", summary: null, readyToClose: false, toolCallCount: 0 } as never);
    mastraReplies({ text: "Done." });
  });

  it("sends the workspace's and project's assembled AI instructions as a system message next to the persona", async () => {
    db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: "ws-1" } as never);
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-1", slug: "acme", name: "Acme", type: "team", description: null, aiInstructions: "Weekly review on Fridays.",
    } as never);
    db.project.findFirst.mockResolvedValue({
      id: "proj-1",
      name: "Offsite",
      workspaceId: "ws-1",
      aiInstructions: "Keep it under budget.",
    } as never);

    await dispatchQueuedRuns(db, new Date());

    const messages = sentMessages();
    expect(messages.map((m) => m.role)).toEqual(["system", "system", "user"]);
    expect(messages[1]!.content).toBe(
      assembleScopeInstructions([
        { scope: "workspace", label: "Workspace", instructions: "Weekly review on Fridays." },
        { scope: "project", label: "Project", instructions: "Keep it under budget." },
      ]),
    );
    // Read as the run's shadow user, scoped to the action's workspace and project.
    expect(db.workspaceUser.findUnique.mock.calls[0]?.[0]).toMatchObject({
      where: { userId_workspaceId: { userId: "shadow-1", workspaceId: "ws-1" } },
    });
    expect(db.project.findFirst.mock.calls[0]?.[0]).toMatchObject({ where: { id: "proj-1" } });
  });

  it("sends no extra message when no scope has instructions", async () => {
    db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: "ws-1" } as never);
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-1", slug: "acme", name: "Acme", type: "team", description: null, aiInstructions: null,
    } as never);
    db.project.findFirst.mockResolvedValue({ id: "proj-1", name: "Offsite", workspaceId: "ws-1", aiInstructions: null } as never);

    await dispatchQueuedRuns(db, new Date());

    expect(sentMessages().map((m) => m.role)).toEqual(["system", "user"]);
    expect(reportHandledErrorServer).not.toHaveBeenCalled();
  });

  it("keeps the workspace scope and reports it when the action's project is hidden from the shadow user", async () => {
    db.workspaceUser.findUnique.mockResolvedValue({ role: "member", workspaceId: "ws-1" } as never);
    db.workspace.findUnique.mockResolvedValue({
      id: "ws-1", slug: "acme", name: "Acme", type: "team", description: null, aiInstructions: "Weekly review on Fridays.",
    } as never);
    db.project.findFirst.mockResolvedValue(null); // restricted project: not visible

    await dispatchQueuedRuns(db, new Date());

    expect(sentMessages().map((m) => m.role)).toEqual(["system", "system", "user"]);
    expect(reportHandledErrorServer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ area: "agentRuns.scopeInstructions", kind: "PROJECT_NOT_VISIBLE" }),
    );
  });

  it("runs without instructions, and reports it, when the shadow user can't read the workspace", async () => {
    db.workspaceUser.findUnique.mockResolvedValue(null);
    db.teamUser.findFirst.mockResolvedValue(null);

    const result = await dispatchQueuedRuns(db, new Date());

    expect(result.succeeded).toEqual([RUN]);
    expect(sentMessages().map((m) => m.role)).toEqual(["system", "user"]);
    expect(reportHandledErrorServer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ area: "agentRuns.scopeInstructions", kind: "FORBIDDEN" }),
    );
  });
});

describe("helpers", () => {
  it("countToolCalls prefers steps, falls back to top-level toolCalls", () => {
    expect(countToolCalls({ steps: [{ toolCalls: [1, 2] }, {}] })).toBe(2);
    expect(countToolCalls({ toolCalls: [1] })).toBe(1);
    expect(countToolCalls({})).toBe(0);
  });

  it("buildPersonaMessage mirrors the chat route's user_data blocks", () => {
    const text = buildPersonaMessage({ name: "Aria", emoji: "✨", personality: "Warm.", instructions: "Be brief.", userContext: null });
    expect(text).toContain("Name: Aria ✨");
    expect(text).toContain('<user_data type="personality">\nWarm.');
    expect(text).toContain('<user_data type="instructions">\nBe brief.');
    expect(text).not.toContain("user_context");
  });
});

describe("buildActionBrief — who a question goes to (decided 2026-10-11)", () => {
  const base = {
    action: { id: "a1", name: "Book the offsite", description: null, dueDate: null, project: null },
    ownerName: "James",
    requesterName: "Ana",
    askName: "Ana",
    predecessorSummary: null,
    wakeComment: null,
  };

  it("names the person a question goes to", () => {
    const brief = buildActionBrief(base);
    expect(brief).toContain("Assigned by Ana.");
    expect(brief).toContain("Your owner is James.");
    expect(brief).toContain("If you need to ask a question, it goes to Ana.");
  });

  it("says who replied when a reply resumed the run", () => {
    const brief = buildActionBrief({
      ...base,
      predecessorSummary: "Asked which venue.",
      wakeComment: "The Lisbon one.",
      wakeCommentAuthorName: "Ana",
    });
    expect(brief).toContain("Ana replied:\nThe Lisbon one.");
    expect(brief).not.toContain("Your owner replied");
  });

  it("hosted and local runs get the same brief, bar the closing protocol line", () => {
    const hosted = buildActionBrief(base).split("\n\n");
    const local = buildActionBrief({ ...base, closing: LOCAL_RUNNER_CLOSING }).split("\n\n");
    expect(local.slice(0, -1)).toEqual(hosted.slice(0, -1));
    expect(LOCAL_RUNNER_CLOSING).not.toContain("owner");
  });
});

describe("finish after a cancel", () => {
  it("does not run the finish hook again when the status update matched nothing (the cancel already did)", async () => {
    mockReset(db);
    finishMock.mockClear();
    fetchMock.mockReset();
    db.agentRun.findMany.mockResolvedValue([{ id: RUN }] as never);
    // Claim succeeds; the finish update later matches 0 rows (run was CANCELLED meanwhile).
    db.agentRun.updateMany.mockResolvedValueOnce({ count: 1 } as never).mockResolvedValue({ count: 0 } as never);
    db.agentRun.findUniqueOrThrow.mockResolvedValueOnce(runRow as never);
    mastraReplies({ error: "boom" }, false, 500);

    await dispatchQueuedRuns(db, new Date());

    expect(finishMock).not.toHaveBeenCalled();
  });

  it("an empty reply with no finish-run leaves the summary null, not an empty string", async () => {
    mockReset(db);
    fetchMock.mockReset();
    db.agentRun.findMany.mockResolvedValue([{ id: RUN }] as never);
    db.agentRun.updateMany.mockResolvedValue({ count: 1 } as never);
    db.agentRun.findUniqueOrThrow
      .mockResolvedValueOnce(runRow as never)
      .mockResolvedValueOnce({ status: "RUNNING", summary: null, readyToClose: false, toolCallCount: 0 } as never);
    mastraReplies({ text: "   ", steps: [] });

    await dispatchQueuedRuns(db, new Date());

    expect(db.agentRun.updateMany.mock.calls[1]?.[0]).toMatchObject({ data: { status: "SUCCEEDED", summary: null } });
  });
});

describe("triggerDispatch — where the CRON_SECRET goes", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true });
    for (const name of ["NEXT_PUBLIC_APP_URL", "VERCEL", "NEXTAUTH_URL", "RAILWAY_PUBLIC_DOMAIN", "PORT"]) {
      vi.stubEnv(name, undefined);
    }
    vi.stubEnv("CRON_SECRET", "cron-secret");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("kicks its own localhost off Vercel, never exponential.im", async () => {
    await triggerDispatch("run-9");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://localhost:3000/api/internal/agent-runs/dispatch?runId=run-9",
    );
  });

  it("kicks exponential.im on Vercel (production unchanged)", async () => {
    vi.stubEnv("VERCEL", "1");

    await triggerDispatch("run-9");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://www.exponential.im/api/internal/agent-runs/dispatch?runId=run-9",
    );
  });
});
