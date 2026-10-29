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
});

describe("setWorkspaceGithubLogin", () => {
  function makeDb(installation: { id: string } | null) {
    const db = {
      integration: { findFirst: vi.fn().mockResolvedValue(installation) },
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
