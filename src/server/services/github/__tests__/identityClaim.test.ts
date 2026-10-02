/**
 * The GitHub identity claim's security-relevant edges: the return path can't
 * become an open redirect, the CSRF state must match exactly, the login comes
 * only from GitHub's own `GET /user`, and one GitHub account can back at most
 * one user.
 */
import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { mockDeep } from "vitest-mock-extended";
import {
  buildGithubAuthorizeUrl,
  claimGithubIdentity,
  decodePendingLink,
  encodePendingLink,
  fetchVerifiedGithubUser,
  safeReturnPath,
  statesMatch,
  withOutcome,
} from "../identityClaim";

describe("safeReturnPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeReturnPath("/settings/profile")).toBe("/settings/profile");
    expect(safeReturnPath("/w/acme/metrics?members=a,b")).toBe("/w/acme/metrics?members=a,b");
  });

  it.each([
    ["https://evil.test/x"],
    ["//evil.test/x"],
    ["/\\evil.test"],
    ["javascript:alert(1)"],
    [""],
    [null],
    [undefined],
  ])("falls back to the profile page for %s", (raw) => {
    expect(safeReturnPath(raw)).toBe("/settings/profile");
  });
});

describe("withOutcome", () => {
  it("appends with the right separator", () => {
    expect(withOutcome("/settings/profile", "linked")).toBe("/settings/profile?github_link=linked");
    expect(withOutcome("/w/a/metrics?members=x", "taken")).toBe("/w/a/metrics?members=x&github_link=taken");
  });
});

describe("statesMatch", () => {
  it("requires an exact, present match", () => {
    expect(statesMatch("abc123", "abc123")).toBe(true);
    expect(statesMatch("abc123", "abc124")).toBe(false);
    expect(statesMatch("abc123", "abc")).toBe(false);
    expect(statesMatch(undefined, "abc123")).toBe(false);
    expect(statesMatch("abc123", null)).toBe(false);
  });
});

describe("pending link cookie", () => {
  it("round-trips and re-validates the return path", () => {
    const raw = encodePendingLink({ state: "s1", returnTo: "/settings/profile", userId: "u-a" });
    expect(decodePendingLink(raw)).toEqual({ state: "s1", returnTo: "/settings/profile", userId: "u-a" });

    const tampered = Buffer.from(
      JSON.stringify({ state: "s1", returnTo: "https://evil.test", userId: "u-a" }),
    ).toString("base64url");
    expect(decodePendingLink(tampered)).toEqual({ state: "s1", returnTo: "/settings/profile", userId: "u-a" });
  });

  it("rejects garbage", () => {
    expect(decodePendingLink(undefined)).toBeNull();
    expect(decodePendingLink("not-base64-json")).toBeNull();
    expect(decodePendingLink(Buffer.from(JSON.stringify({ state: 1 })).toString("base64url"))).toBeNull();
    // A pending link that doesn't name who started it is never trusted.
    expect(
      decodePendingLink(Buffer.from(JSON.stringify({ state: "s1", returnTo: "/x" })).toString("base64url")),
    ).toBeNull();
  });
});

describe("buildGithubAuthorizeUrl", () => {
  it("asks for no scopes and disallows sign-up", () => {
    const url = new URL(
      buildGithubAuthorizeUrl({ clientId: "cid", redirectUri: "https://app.test/cb", state: "st" }),
    );
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("cid");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("allow_signup")).toBe("false");
    expect(url.searchParams.has("scope")).toBe(false);
  });
});

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe("fetchVerifiedGithubUser", () => {
  const base = { code: "c", redirectUri: "https://app.test/cb", clientId: "cid", clientSecret: "sec" };

  it("returns the id and login GitHub reports for the token", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ id: 123, login: "Octo-Cat" }));

    await expect(fetchVerifiedGithubUser({ ...base, fetchImpl })).resolves.toEqual({
      id: "123",
      login: "Octo-Cat",
    });
    const userCall = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(userCall[0]).toBe("https://api.github.com/user");
    expect((userCall[1].headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("throws when GitHub refuses the code", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({ error: "bad_verification_code" }));
    await expect(fetchVerifiedGithubUser({ ...base, fetchImpl })).rejects.toThrow("bad_verification_code");
  });

  it("throws when the user lookup fails or is malformed", async () => {
    const failing = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(fetchVerifiedGithubUser({ ...base, fetchImpl: failing })).rejects.toThrow("401");

    const malformed = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: "tok" }))
      .mockResolvedValueOnce(jsonResponse({ id: "123", login: "" }));
    await expect(fetchVerifiedGithubUser({ ...base, fetchImpl: malformed })).rejects.toThrow("no id/login");
  });
});

describe("claimGithubIdentity", () => {
  const octo = { id: "123", login: "Octo-Cat" };

  function db() {
    const mock = mockDeep<PrismaClient>();
    mock.$transaction.mockResolvedValue([] as never);
    return mock;
  }

  it("refuses a GitHub account already claimed by someone else", async () => {
    const mock = db();
    mock.user.findUnique.mockResolvedValue({ id: "other" } as never);

    await expect(claimGithubIdentity(mock, "me", octo)).resolves.toEqual({ ok: false, reason: "taken" });
    expect(mock.$transaction).not.toHaveBeenCalled();
  });

  it("records the claim and clears a stale holder of the same login", async () => {
    const mock = db();
    mock.user.findUnique.mockResolvedValue(null as never);

    await expect(claimGithubIdentity(mock, "me", octo)).resolves.toEqual({ ok: true, login: "Octo-Cat" });
    expect(mock.user.updateMany).toHaveBeenCalledWith({
      where: { id: { not: "me" }, githubLogin: { equals: "Octo-Cat", mode: "insensitive" } },
      data: { githubLogin: null, githubId: null, githubLinkedAt: null },
    });
    expect(mock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "me" },
        data: expect.objectContaining({ githubLogin: "Octo-Cat", githubId: "123" }) as unknown,
      }),
    );
  });

  it("lets a user re-link the account they already hold", async () => {
    const mock = db();
    mock.user.findUnique.mockResolvedValue({ id: "me" } as never);
    await expect(claimGithubIdentity(mock, "me", octo)).resolves.toEqual({ ok: true, login: "Octo-Cat" });
  });

  it("reports a lost race on the unique githubId as taken", async () => {
    const mock = db();
    mock.user.findUnique.mockResolvedValue(null as never);
    mock.$transaction.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    await expect(claimGithubIdentity(mock, "me", octo)).resolves.toEqual({ ok: false, reason: "taken" });
  });
});
