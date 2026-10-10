/**
 * The agent_run notification category (ADR-0067, Agent PRD D8): recipients
 * are the requester and the Assistant's owner, deduped when they are one
 * person; the content names the Assistant and carries the summary; one
 * dedupe key per run and recipient.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { resolveRecipients } from "../recipients";
import { buildContent } from "../content";
import { NOTIFICATION_CATEGORIES, CATEGORY_LIST, DEFAULT_MATRIX } from "../constants";

const db = mockDeep<PrismaClient>();

const input = {
  category: NOTIFICATION_CATEGORIES.AGENT_RUN,
  actorUserId: "shadow-1",
  subject: { runId: "run-1", actionId: "action-1", outcome: "finished" as const },
  db,
};

describe("agent_run notifications", () => {
  beforeEach(() => mockReset(db));

  it("is registered: in the category list with push and email on, opt-in channels off", () => {
    expect(CATEGORY_LIST).toContain("agent_run");
    expect(DEFAULT_MATRIX.agent_run).toEqual({ push: true, email: true, matrix: false, whatsapp: false, zulip: false });
  });

  it("recipients: requester ∪ owner, deduped when the owner requested it", async () => {
    db.agentRun.findUnique.mockResolvedValue({ requestedById: "req-1", agent: { ownerId: "owner-1" } } as never);
    expect(await resolveRecipients(input)).toEqual(["req-1", "owner-1"]);

    db.agentRun.findUnique.mockResolvedValue({ requestedById: "owner-1", agent: { ownerId: "owner-1" } } as never);
    expect(await resolveRecipients(input)).toEqual(["owner-1"]);

    // An agent reassigned (no human requester): the owner alone.
    db.agentRun.findUnique.mockResolvedValue({ requestedById: null, agent: { ownerId: "owner-1" } } as never);
    expect(await resolveRecipients(input)).toEqual(["owner-1"]);
  });

  it("content: '<Assistant> finished: <action>' with the summary, a run-scoped dedupe key, and the action deeplink", async () => {
    db.agentRun.findUnique.mockResolvedValue({
      summary: "Two venues shortlisted.", error: null, status: "SUCCEEDED", readyToClose: true,
      agent: { name: "Aria" }, action: { name: "Find a venue" },
    } as never);
    db.action.findUnique.mockResolvedValue({ workspace: { id: "ws-1", slug: "acme", name: "Acme" }, project: null } as never);

    const content = await buildContent(input, "owner-1");
    expect(content).toMatchObject({
      category: "agent_run",
      title: "Aria finished: Find a venue",
      message: "Two venues shortlisted.",
      deeplink: "/w/acme/actions/action-1",
      workspaceId: "ws-1",
      dedupeKey: "agent_run:run-1:owner-1",
      metadata: { readyToClose: true, outcome: "finished" },
    });
  });

  it("content for a stopped run names the error", async () => {
    db.agentRun.findUnique.mockResolvedValue({
      summary: null, error: "No heartbeat for 5 minutes", status: "TIMED_OUT", readyToClose: false,
      agent: { name: "Aria" }, action: { name: "Find a venue" },
    } as never);
    db.action.findUnique.mockResolvedValue({ workspace: { id: "ws-1", slug: "acme", name: "Acme" }, project: null } as never);

    const content = await buildContent({ ...input, subject: { ...input.subject, outcome: "stopped" } }, "owner-1");
    expect(content).toMatchObject({ title: "Aria stopped: Find a venue", message: "No heartbeat for 5 minutes" });
  });
});
