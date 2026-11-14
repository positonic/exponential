/**
 * Unit tests for `navigationPreference.setVisibleItems`, the menu picker's
 * write. Mocked Prisma (see CLAUDE.md "Test database safety"): the rule under
 * test is which rows get rewritten and with what, not SQL behaviour.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

vi.hoisted(() => {
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("~/server/auth", () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("~/server/db", () => ({ db: {} }));

import { createCallerFactory } from "~/server/api/trpc";
import { visibleNavItemIds, type NavSection } from "~/lib/navLayout";
import { navigationPreferenceRouter } from "../navigationPreference";

const createCaller = createCallerFactory(navigationPreferenceRouter);
const db: DeepMockProxy<PrismaClient> = mockDeep<PrismaClient>();
const USER = "user-1";

function caller() {
  return createCaller({
    db: db as unknown as PrismaClient,
    session: { user: { id: USER, email: "u@test.com", name: "U", image: null, isAdmin: false }, expires: "2099-01-01" },
    headers: new Headers(),
  } as never);
}

beforeEach(() => {
  mockReset(db);
  db.navigationPreference.findUnique.mockResolvedValue(null);
  db.workspaceNavLayout.findMany.mockResolvedValue([]);
  db.$transaction.mockResolvedValue([] as never);
});

describe("navigationPreference.setVisibleItems", () => {
  it("writes the user-wide layout showing exactly the chosen items", async () => {
    const result = await caller().setVisibleItems({ visibleItemIds: ["actions", "projects"] });

    expect(visibleNavItemIds(result.navLayout)).toEqual(["actions", "projects"]);
    const upsert = db.navigationPreference.upsert.mock.calls[0]?.[0];
    expect(upsert?.where).toEqual({ userId: USER });
    expect(visibleNavItemIds(upsert?.update.navLayout as NavSection[])).toEqual(["actions", "projects"]);
    expect(visibleNavItemIds(upsert?.create.navLayout as NavSection[])).toEqual(["actions", "projects"]);
  });

  it("applies the same choice to every workspace layout the person has", async () => {
    // A row like the one folding a section creates: the old all-visible menu.
    db.workspaceNavLayout.findMany.mockResolvedValue([
      {
        id: "row-1",
        navLayout: [
          { id: "align", name: "Plan", hidden: false, collapsed: true, items: [{ id: "goals", hidden: false }] },
          { id: "connect", name: "Clients", hidden: false, items: [{ id: "crm", hidden: false }] },
        ],
      },
      { id: "row-2", navLayout: [] },
    ] as never);

    await caller().setVisibleItems({ visibleItemIds: ["goals"] });

    expect(db.workspaceNavLayout.findMany.mock.calls[0]?.[0]?.where).toEqual({ userId: USER });
    expect(db.workspaceNavLayout.update).toHaveBeenCalledTimes(2);
    const first = db.workspaceNavLayout.update.mock.calls[0]?.[0];
    expect(first?.where).toEqual({ id: "row-1" });
    const layout = first?.data.navLayout as NavSection[];
    expect(visibleNavItemIds(layout)).toEqual(["goals"]);
    // Visibility only: the person's fold and rename survive.
    expect(layout.find((s) => s.id === "align")?.collapsed).toBe(true);
    expect(layout.find((s) => s.id === "connect")?.name).toBe("Clients");
  });

  it("keeps the order and names of a saved user-wide layout", async () => {
    db.navigationPreference.findUnique.mockResolvedValue({
      navLayout: [
        { id: "amplify", name: "Kit", hidden: false, items: [{ id: "meetings", hidden: false }] },
        { id: "align", name: "Plan", hidden: false, items: [{ id: "goals", hidden: false }] },
      ],
    } as never);

    const { navLayout } = await caller().setVisibleItems({ visibleItemIds: ["goals"] });

    expect(navLayout.slice(0, 2).map((s) => s.name)).toEqual(["Kit", "Plan"]);
    expect(visibleNavItemIds(navLayout)).toEqual(["goals"]);
  });

  it("refuses an id that is not a sidebar item", async () => {
    await expect(
      caller().setVisibleItems({ visibleItemIds: ["goals", "constructor"] }),
    ).rejects.toThrow();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("accepts an empty menu", async () => {
    const { navLayout } = await caller().setVisibleItems({ visibleItemIds: [] });
    expect(visibleNavItemIds(navLayout)).toEqual([]);
  });
});
