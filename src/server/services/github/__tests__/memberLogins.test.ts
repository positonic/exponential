import { describe, it, expect, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  normalizeGithubLogin,
  resolveGithubIdentities,
  setWorkspaceGithubLogin,
} from "../memberLogins";

describe("normalizeGithubLogin", () => {
  it.each([
    ["octocat", "octocat"],
    ["  @Octo-Cat ", "Octo-Cat"],
    ["https://github.com/octocat/", "octocat"],
    ["github.com/octocat", "octocat"],
  ])("accepts %j as %j", (input, expected) => {
    expect(normalizeGithubLogin(input)).toBe(expected);
  });

  it.each(["", "-octocat", "octo--cat", "octo cat", "a".repeat(40), "octocat/repo"])(
    "rejects %j",
    (input) => {
      expect(normalizeGithubLogin(input)).toBeNull();
    },
  );
});

describe("resolveGithubIdentities", () => {
  it("prefers the member's own account, then the newest workspace-set username", async () => {
    const db = {
      integration: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "u1", credentials: [{ key: JSON.stringify({ githubUsername: "own-login" }) }] },
        ]),
      },
      integrationUserMapping: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "u1", externalUserId: "admin-set" },
          { userId: "u2", externalUserId: "newest" },
          { userId: "u2", externalUserId: "older" },
        ]),
      },
    } as unknown as PrismaClient;

    const identities = await resolveGithubIdentities(db, "ws-1", ["u1", "u2", "u3"]);

    expect(identities.get("u1")).toEqual({ login: "own-login", source: "account" });
    expect(identities.get("u2")).toEqual({ login: "newest", source: "workspace" });
    expect(identities.has("u3")).toBe(false);
  });

  it("ignores a workspace-set username that is another member's connected account", async () => {
    const db = {
      integration: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "alice", credentials: [{ key: JSON.stringify({ githubUsername: "Alice-GH" }) }] },
        ]),
      },
      integrationUserMapping: {
        findMany: vi.fn().mockResolvedValue([{ userId: "bob", externalUserId: "alice-gh" }]),
      },
    } as unknown as PrismaClient;

    const identities = await resolveGithubIdentities(db, "ws-1", ["alice", "bob"]);

    expect(identities.get("alice")).toEqual({ login: "Alice-GH", source: "account" });
    expect(identities.has("bob")).toBe(false);
  });

  it("ignores the collision even when only the workspace-set member is requested", async () => {
    const db = {
      integration: {
        // Workspace-wide: Alice's account is found though only Bob is asked for.
        findMany: vi.fn().mockResolvedValue([
          { userId: "alice", credentials: [{ key: JSON.stringify({ githubUsername: "Alice-GH" }) }] },
        ]),
      },
      integrationUserMapping: {
        findMany: vi.fn().mockResolvedValue([{ userId: "bob", externalUserId: "alice-gh" }]),
      },
    } as unknown as PrismaClient;

    const identities = await resolveGithubIdentities(db, "ws-1", ["bob"]);

    expect(identities.size).toBe(0);
  });
});

describe("setWorkspaceGithubLogin", () => {
  function makeDb(
    installation: { id: string } | null,
    accounts: { userId: string; login: string }[] = [],
  ) {
    const db = {
      integration: {
        findFirst: vi.fn().mockResolvedValue(installation),
        findMany: vi.fn().mockResolvedValue(
          accounts.map((a) => ({
            userId: a.userId,
            credentials: [{ key: JSON.stringify({ githubUsername: a.login }) }],
          })),
        ),
      },
      integrationUserMapping: {
        deleteMany: vi.fn().mockReturnValue("delete-op"),
        create: vi.fn().mockReturnValue("create-op"),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    return db;
  }

  it("replaces the member's login and takes it from anyone who had it", async () => {
    const db = makeDb({ id: "inst-1" });
    await setWorkspaceGithubLogin(db as unknown as PrismaClient, {
      workspaceId: "ws-1",
      userId: "u1",
      login: "@Octocat",
    });

    expect(db.integrationUserMapping.deleteMany).toHaveBeenCalledWith({
      where: {
        integrationId: "inst-1",
        OR: [
          { userId: "u1" },
          { externalUserId: { equals: "Octocat", mode: "insensitive" } },
        ],
      },
    });
    expect(db.integrationUserMapping.create).toHaveBeenCalledWith({
      data: { integrationId: "inst-1", externalUserId: "Octocat", userId: "u1" },
    });
    expect(db.$transaction).toHaveBeenCalledWith(["delete-op", "create-op"]);
  });

  it("refuses a login another member connected themselves", async () => {
    const db = makeDb({ id: "inst-1" }, [{ userId: "alice", login: "Alice-GH" }]);
    await expect(
      setWorkspaceGithubLogin(db as unknown as PrismaClient, {
        workspaceId: "ws-1",
        userId: "bob",
        login: "alice-gh",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("lets a member be given the login of their own connected account", async () => {
    const db = makeDb({ id: "inst-1" }, [{ userId: "alice", login: "Alice-GH" }]);
    await setWorkspaceGithubLogin(db as unknown as PrismaClient, {
      workspaceId: "ws-1",
      userId: "alice",
      login: "Alice-GH",
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it("clears the member's login when given null", async () => {
    const db = makeDb({ id: "inst-1" });
    await setWorkspaceGithubLogin(db as unknown as PrismaClient, {
      workspaceId: "ws-1",
      userId: "u1",
      login: null,
    });
    expect(db.integrationUserMapping.create).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(["delete-op"]);
  });

  it("refuses an invalid username", async () => {
    const db = makeDb({ id: "inst-1" });
    await expect(
      setWorkspaceGithubLogin(db as unknown as PrismaClient, {
        workspaceId: "ws-1",
        userId: "u1",
        login: "not a login",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("needs the workspace's GitHub App installation", async () => {
    const db = makeDb(null);
    await expect(
      setWorkspaceGithubLogin(db as unknown as PrismaClient, {
        workspaceId: "ws-1",
        userId: "u1",
        login: "octocat",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });
});
