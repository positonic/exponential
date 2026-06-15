/**
 * Unit tests for `notionAgentService` (ADR-0020 — Notion via authenticated callback).
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real database is
 * ever touched (see CLAUDE.md "Test database safety"). The Notion client is
 * injected via the `makeNotionService` factory, so the logic is exercised with a
 * fake that returns canned hits — no network.
 *
 * Asserts external behaviour through the service interface: credential resolution
 * (workspace-scoped wins, personal fallback, not-connected) and the
 * `{connected}`-discriminated search shape.
 *
 * Prior art: `goalService.test.ts`, `access/__tests__/permissions.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// `notionAgentService` transitively imports `~/server/db`, which runs T3 env
// validation at module load. Seed the minimum env BEFORE the import graph evaluates.
vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
});

import { NotionAgentService } from "../notionAgentService";
import type { NotionService, NotionSearchHit } from "../NotionService";

const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";

const db = mockDeep<PrismaClient>();

/** A row as returned by `integration.findFirst` with credentials included. */
function integrationRow(token: string, workspaceId: string | null) {
  return {
    id: `int-${workspaceId ?? "personal"}`,
    provider: "notion",
    userId: USER_ID,
    workspaceId,
    credentials: [
      // plaintext (isEncrypted:false) so getDecryptedKey returns it verbatim
      { key: token, keyType: "access_token", isEncrypted: false },
    ],
  };
}

/** Build a fake NotionService whose `search` returns the given hits. */
function fakeNotionService(hits: NotionSearchHit[], hasMore = false) {
  const search = vi.fn().mockResolvedValue({ results: hits, hasMore });
  return { search } as unknown as NotionService;
}

const HIT: NotionSearchHit = {
  id: "page-1",
  type: "page",
  title: "Payments 2026",
  url: "https://notion.so/page-1",
};

describe("NotionAgentService — credential resolution", () => {
  beforeEach(() => mockReset(db));

  it("uses the workspace-scoped integration when one matches", async () => {
    let capturedToken: string | undefined;
    db.integration.findFirst.mockImplementation((args: any) => {
      // workspace-scoped query
      if (args.where.workspaceId === WORKSPACE_ID) {
        return integrationRow("ws-token", WORKSPACE_ID) as any;
      }
      return integrationRow("personal-token", null) as any;
    });

    const svc = new NotionAgentService({
      db,
      makeNotionService: (token) => {
        capturedToken = token;
        return fakeNotionService([HIT]);
      },
    });

    const result = await svc.resolveService(USER_ID, WORKSPACE_ID);
    expect(result.connected).toBe(true);
    expect(capturedToken).toBe("ws-token");
  });

  it("falls back to the personal (workspace-less) integration when no workspace row matches", async () => {
    let capturedToken: string | undefined;
    db.integration.findFirst.mockImplementation((args: any) => {
      if (args.where.workspaceId === WORKSPACE_ID) return null as any; // no workspace row
      if (args.where.workspaceId === null) {
        return integrationRow("personal-token", null) as any;
      }
      return null as any;
    });

    const svc = new NotionAgentService({
      db,
      makeNotionService: (token) => {
        capturedToken = token;
        return fakeNotionService([HIT]);
      },
    });

    const result = await svc.resolveService(USER_ID, WORKSPACE_ID);
    expect(result.connected).toBe(true);
    expect(capturedToken).toBe("personal-token");
  });

  it("returns {connected:false} when the user has no Notion integration", async () => {
    db.integration.findFirst.mockResolvedValue(null as any);

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([HIT]),
    });

    const result = await svc.resolveService(USER_ID, WORKSPACE_ID);
    expect(result).toEqual({ connected: false });
  });

  it("returns {connected:false} when the integration has no usable token credential", async () => {
    db.integration.findFirst.mockResolvedValue({
      id: "int-1",
      provider: "notion",
      userId: USER_ID,
      workspaceId: null,
      credentials: [{ key: "{}", keyType: "notion_metadata", isEncrypted: false }],
    } as any);

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([HIT]),
    });

    expect(await svc.resolveService(USER_ID, null)).toEqual({ connected: false });
  });
});

describe("NotionAgentService — search", () => {
  beforeEach(() => mockReset(db));

  it("returns {connected:true, total>0} with the lean hits when there are matches", async () => {
    db.integration.findFirst.mockResolvedValue(
      integrationRow("personal-token", null) as any,
    );

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([HIT], true),
    });

    const result = await svc.search(USER_ID, null, "payments");
    expect(result).toEqual({
      connected: true,
      total: 1,
      results: [HIT],
      hasMore: true,
    });
  });

  it("returns {connected:true, total:0} when the integration is present but matches nothing", async () => {
    db.integration.findFirst.mockResolvedValue(
      integrationRow("personal-token", null) as any,
    );

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => fakeNotionService([]),
    });

    const result = await svc.search(USER_ID, WORKSPACE_ID, "nothing-here");
    expect(result).toEqual({
      connected: true,
      total: 0,
      results: [],
      hasMore: false,
    });
  });

  it("returns {connected:false} (no search attempted) when Notion is not connected", async () => {
    db.integration.findFirst.mockResolvedValue(null as any);
    const search = vi.fn();

    const svc = new NotionAgentService({
      db,
      makeNotionService: () => ({ search } as unknown as NotionService),
    });

    expect(await svc.search(USER_ID, null, "anything")).toEqual({
      connected: false,
    });
    expect(search).not.toHaveBeenCalled();
  });
});
