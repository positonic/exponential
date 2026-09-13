/**
 * `captureAction` over a mocked parser and a mocked Action write module:
 * what the voice layer hands the module, and the shape it returns.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { TRPCError } from "@trpc/server";

vi.mock("~/server/services/parsing/parseActionInput", () => ({
  parseActionInput: vi.fn(),
}));
vi.mock("~/server/services/actions", () => ({
  createAction: vi.fn(),
}));

import { parseActionInput } from "~/server/services/parsing/parseActionInput";
import { createAction } from "~/server/services/actions";
import { captureAction } from "../capture";

const USER = "user-1";

describe("captureAction", () => {
  let db: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    db = mockDeep<PrismaClient>();
    vi.mocked(parseActionInput).mockReset();
    vi.mocked(createAction).mockReset();
  });

  it("creates through the module with source voice, the parsed project and the session workspace", async () => {
    const due = new Date("2026-09-20T00:00:00.000Z");
    vi.mocked(parseActionInput).mockResolvedValue({
      name: "Send the investor update",
      scheduledStart: null,
      dueDate: due,
      projectId: "p1",
      parsingMetadata: null,
    } as never);
    vi.mocked(createAction).mockResolvedValue({
      id: "a1",
      name: "Send the investor update",
      priority: "Quick",
      status: "ACTIVE",
      dueDate: due,
      project: { id: "p1", name: "Acme", workspaceId: "w1" },
    } as never);

    const res = await captureAction("send the investor update friday", USER, db, "w1");

    expect(createAction).toHaveBeenCalledWith(
      { db, actor: { userId: USER, isAdmin: false } },
      expect.objectContaining({
        name: "Send the investor update",
        projectId: "p1",
        workspaceId: "w1",
        priority: "Quick",
        status: "ACTIVE",
        dueDate: due,
        source: "voice",
      }),
    );
    expect(res).toEqual({
      action: {
        id: "a1",
        name: "Send the investor update",
        priority: "Quick",
        status: "ACTIVE",
        dueDate: due,
        project: { id: "p1", name: "Acme" },
      },
      inbox: false,
    });
  });

  it("lands in the inbox when the parser matched no project", async () => {
    vi.mocked(parseActionInput).mockResolvedValue({
      name: "Buy milk",
      scheduledStart: null,
      dueDate: null,
      projectId: null,
      parsingMetadata: null,
    } as never);
    vi.mocked(createAction).mockResolvedValue({
      id: "a2",
      name: "Buy milk",
      priority: "Quick",
      status: "ACTIVE",
      dueDate: null,
      project: null,
    } as never);

    const res = await captureAction("buy milk", USER, db);

    expect(createAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ projectId: expect.anything() }),
    );
    expect(res.inbox).toBe(true);
    expect(res.action.project).toBeNull();
  });

  it("lets the module's write gate surface (the voice router turns it into a spoken refusal)", async () => {
    vi.mocked(parseActionInput).mockResolvedValue({
      name: "x", scheduledStart: null, dueDate: null, projectId: null, parsingMetadata: null,
    } as never);
    vi.mocked(createAction).mockRejectedValue(new TRPCError({ code: "FORBIDDEN", message: "read-only" }));

    await expect(captureAction("x", USER, db, "w-readonly")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
