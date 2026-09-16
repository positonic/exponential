import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import { buildDraftAnswers } from "../draftAnswers";
import { perPersonQuestions, readAnswers, supportsAsyncUpdates } from "../questions";

const until = new Date("2026-09-10T08:00:00Z");
const since = new Date("2026-09-09T08:00:00Z");
const questions = perPersonQuestions("STANDUP");

function db() {
  const mock = mockDeep<PrismaClient>();
  mock.action.findMany.mockResolvedValue([] as never);
  mock.workspaceActivityEvent.findMany.mockResolvedValue([] as never);
  mock.ticket.findMany.mockResolvedValue([] as never);
  mock.gitHubActivity.findMany.mockResolvedValue([] as never);
  mock.integration.findFirst.mockResolvedValue(null as never);
  return mock;
}

describe("per-person questions", () => {
  it("only standups collect async updates", () => {
    expect(supportsAsyncUpdates("STANDUP")).toBe(true);
    expect(supportsAsyncUpdates("PLANNING")).toBe(false);
    expect(perPersonQuestions("PLANNING")).toEqual([]);
  });

  it("drops answers whose key is not a question for the kind", () => {
    expect(readAnswers({ done: "shipped", nonsense: "x", today: 3 }, "STANDUP")).toEqual({ done: "shipped" });
    expect(readAnswers(null, "STANDUP")).toEqual({});
    expect(readAnswers(["done"], "STANDUP")).toEqual({});
  });
});

describe("buildDraftAnswers", () => {
  it("windows completed actions to the participant, the workspace and the gap since the previous occurrence", async () => {
    const mock = db();
    await buildDraftAnswers(mock, { workspaceId: "ws-1", userId: "u-1", questions, since, until, projectId: "p-1" });
    const where = mock.action.findMany.mock.calls[0]![0]!.where!;
    expect(where).toMatchObject({
      workspaceId: "ws-1",
      projectId: "p-1",
      assignees: { some: { userId: "u-1" } },
      completedAt: { gt: since, lte: until },
    });
  });

  it("takes everything completed to date when there is no previous occurrence", async () => {
    const mock = db();
    await buildDraftAnswers(mock, { workspaceId: "ws-1", userId: "u-1", questions, since: null, until });
    expect(mock.action.findMany.mock.calls[0]![0]!.where!.completedAt).toEqual({ lte: until });
  });

  it("renders completed and open actions as bullets, and leaves undraftable questions empty", async () => {
    const mock = db();
    mock.action.findMany
      .mockResolvedValueOnce([{ id: "a-1", name: "Ship the importer", completedAt: since }] as never)
      .mockResolvedValueOnce([
        { id: "a-2", name: "Review the queue", dueDate: new Date("2026-09-11T00:00:00Z") },
        { id: "a-3", name: "Write the ADR", dueDate: null },
      ] as never);
    const { answers, hasContent } = await buildDraftAnswers(mock, {
      workspaceId: "ws-1",
      userId: "u-1",
      questions,
      since,
      until,
    });
    expect(answers.done).toBe("- Ship the importer");
    expect(answers.today).toBe("- Review the queue (due 11 Sept)\n- Write the ADR");
    expect(answers.blockers).toBe("");
    expect(hasContent).toBe(true);
  });

  it("drafts nothing rather than inventing a summary when there is no activity", async () => {
    const mock = db();
    const { answers, hasContent } = await buildDraftAnswers(mock, {
      workspaceId: "ws-1",
      userId: "u-1",
      questions,
      since,
      until,
    });
    expect(Object.values(answers).every((v) => v === "")).toBe(true);
    expect(hasContent).toBe(false);
  });

  it("runs no queries for a kind with no drafted questions", async () => {
    const mock = db();
    await buildDraftAnswers(mock, { workspaceId: "ws-1", userId: "u-1", questions: [], since, until });
    expect(mock.action.findMany).not.toHaveBeenCalled();
  });
});

describe("ticket and commit sources", () => {
  it("lists a ticket's whole journey once, and only tickets assigned to the participant", async () => {
    const mock = db();
    mock.workspaceActivityEvent.findMany.mockResolvedValue([
      { entityId: "t-1", metadata: { from: "BACKLOG", to: "IN_PROGRESS" }, createdAt: since },
      { entityId: "t-1", metadata: { from: "IN_PROGRESS", to: "IN_REVIEW" }, createdAt: since },
      { entityId: "t-2", metadata: { from: "BACKLOG", to: "DONE" }, createdAt: since },
    ] as never);
    mock.ticket.findMany.mockResolvedValue([
      { id: "t-1", shortId: "opal.bobcat", number: 569, title: "Ceremonies V3" },
    ] as never);
    const { answers } = await buildDraftAnswers(mock, {
      workspaceId: "ws-1",
      userId: "u-1",
      questions,
      since,
      until,
    });
    expect(mock.ticket.findMany.mock.calls[0]![0]!.where).toMatchObject({ assigneeId: "u-1" });
    expect(answers.done).toBe("- opal.bobcat Ceremonies V3 (backlog → in review)");
  });

  it("falls back to the ticket number when it has no short id", async () => {
    const mock = db();
    mock.workspaceActivityEvent.findMany.mockResolvedValue([
      { entityId: "t-3", metadata: { from: "BACKLOG", to: "BACKLOG" }, createdAt: since },
    ] as never);
    mock.ticket.findMany.mockResolvedValue([{ id: "t-3", shortId: null, number: 42, title: "Nameless" }] as never);
    const { answers } = await buildDraftAnswers(mock, {
      workspaceId: "ws-1",
      userId: "u-1",
      questions,
      since,
      until,
    });
    expect(answers.done).toBe("- #42 Nameless (backlog)");
  });

  it("matches commits through the participant's own github login", async () => {
    const mock = db();
    mock.integration.findFirst.mockResolvedValue({
      credentials: [{ key: JSON.stringify({ githubUsername: "positonic" }) }],
    } as never);
    mock.gitHubActivity.findMany.mockResolvedValue([
      { commitSha: "9ac790c", commitMessage: "feat(ceremonies): draft an update\n\nbody" },
      { commitSha: null, commitMessage: "   " },
    ] as never);
    const { answers } = await buildDraftAnswers(mock, {
      workspaceId: "ws-1",
      userId: "u-1",
      questions,
      since,
      until,
    });
    expect(mock.gitHubActivity.findMany.mock.calls[0]![0]!.where).toMatchObject({
      commitAuthor: { equals: "positonic", mode: "insensitive" },
      eventTimestamp: { gt: since, lte: until },
    });
    expect(answers.done).toBe("- `9ac790c` feat(ceremonies): draft an update");
  });

  it("drafts no commits for someone with no github integration", async () => {
    const mock = db();
    await buildDraftAnswers(mock, { workspaceId: "ws-1", userId: "u-1", questions, since, until });
    expect(mock.gitHubActivity.findMany).not.toHaveBeenCalled();
  });

  it("survives unreadable integration metadata", async () => {
    const mock = db();
    mock.integration.findFirst.mockResolvedValue({ credentials: [{ key: "not json" }] } as never);
    const { answers } = await buildDraftAnswers(mock, {
      workspaceId: "ws-1",
      userId: "u-1",
      questions,
      since,
      until,
    });
    expect(answers.done).toBe("");
    expect(mock.gitHubActivity.findMany).not.toHaveBeenCalled();
  });

  it("runs each source once however many questions ask for it", async () => {
    const mock = db();
    const twoAsks = [
      { key: "a", prompt: "a", placeholder: "", draftFrom: ["completed-actions"] as const },
      { key: "b", prompt: "b", placeholder: "", draftFrom: ["completed-actions"] as const },
    ];
    mock.action.findMany.mockResolvedValue([{ id: "a-1", name: "Ship it" }] as never);
    const { answers } = await buildDraftAnswers(mock, {
      workspaceId: "ws-1",
      userId: "u-1",
      questions: twoAsks,
      since,
      until,
    });
    expect(mock.action.findMany).toHaveBeenCalledTimes(1);
    expect(answers).toEqual({ a: "- Ship it", b: "- Ship it" });
  });
});
