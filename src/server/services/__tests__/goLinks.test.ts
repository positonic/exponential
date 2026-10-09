import { describe, it, expect, beforeEach } from "vitest";
import { mockDeep, mockReset } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { resolveGoWorkspaceSlug, sanitizeGoRoute } from "../goLinks";

const db = mockDeep<PrismaClient>();

beforeEach(() => {
  mockReset(db);
});

describe("resolveGoWorkspaceSlug", () => {
  it("prefers the user's default workspace when they still have access to it", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-team" } as never);
    db.workspace.findFirst.mockResolvedValueOnce({ slug: "acme" } as never);
    await expect(resolveGoWorkspaceSlug(db, "u1")).resolves.toBe("acme");
    expect(db.workspace.findFirst).toHaveBeenCalledTimes(1);
  });

  it("falls back to the Personal workspace when the default is gone or inaccessible", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: "ws-old" } as never);
    db.workspace.findFirst
      .mockResolvedValueOnce(null) // default no longer accessible
      .mockResolvedValueOnce({ slug: "personal-u1" } as never);
    await expect(resolveGoWorkspaceSlug(db, "u1")).resolves.toBe("personal-u1");
    const personalCall = db.workspace.findFirst.mock.calls[1]?.[0];
    expect(personalCall?.where).toMatchObject({ type: "personal", ownerId: "u1" });
  });

  it("uses the first accessible workspace when there is no default and no personal one", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.workspace.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ slug: "guest-ws" } as never);
    await expect(resolveGoWorkspaceSlug(db, "u1")).resolves.toBe("guest-ws");
  });

  it("returns null for an account with no workspace at all", async () => {
    db.user.findUnique.mockResolvedValue({ defaultWorkspaceId: null } as never);
    db.workspace.findFirst.mockResolvedValue(null);
    await expect(resolveGoWorkspaceSlug(db, "u1")).resolves.toBeNull();
  });
});

describe("sanitizeGoRoute", () => {
  it("joins plain segments", () => {
    expect(sanitizeGoRoute(["settings", "plugins"])).toBe("settings/plugins");
    expect(sanitizeGoRoute(["crm", "contacts"])).toBe("crm/contacts");
  });

  it("rejects empty, traversal and scheme-like input", () => {
    expect(sanitizeGoRoute([])).toBeNull();
    expect(sanitizeGoRoute([".."])).toBeNull();
    expect(sanitizeGoRoute(["goals", "..", "x"])).toBeNull();
    expect(sanitizeGoRoute(["https:", "evil.example"])).toBeNull();
    expect(sanitizeGoRoute(["//evil.example"])).toBeNull();
  });
});
