/**
 * The hosted executor (ADR-0067, Agent PRD D4): atomic claim, persona + brief
 * to the run agent as the shadow user with a runId claim, SUCCEEDED with the
 * agent's text as summary when finish-run was never called, FAILED on a
 * Mastra error, and a second dispatcher is a no-op. Mocked Prisma + fetch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import jwt from "jsonwebtoken";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.MASTRA_API_URL = "http://mastra.test:4111";
  process.env.SKIP_ENV_VALIDATION ??= "true";
});

const { dispatchQueuedRuns, countToolCalls, buildPersonaMessage } = await import("../dispatch");

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

  it("a second dispatcher that loses the claim does nothing", async () => {
    db.agentRun.updateMany.mockResolvedValue({ count: 0 } as never);

    const result = await dispatchQueuedRuns(db, new Date());

    expect(result.claimed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
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
