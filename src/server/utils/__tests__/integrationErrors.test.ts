import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { APIErrorCode, APIResponseError, RequestTimeoutError } from "@notionhq/client";

import {
  classifyIntegrationError,
  IntegrationAuthError,
  IntegrationUnavailableError,
  oauthRefreshFailure,
  toIntegrationTRPCError,
} from "../integrationErrors";
import { TimeoutError } from "../withTimeout";

function octokitError(status: number, message = "Bad credentials") {
  return Object.assign(new Error(message), { name: "HttpError", status });
}

function notionError(code: APIErrorCode, status: number, message: string) {
  return new APIResponseError({ code, status, message, headers: {}, rawBodyText: "{}" });
}

describe("classifyIntegrationError", () => {
  it("classifies GitHub 'Bad credentials' as auth", () => {
    expect(classifyIntegrationError(octokitError(401))).toMatchObject({ kind: "auth", provider: "GitHub" });
  });

  it("classifies a GitHub rate limit and a GitHub 5xx", () => {
    expect(classifyIntegrationError(octokitError(403, "API rate limit exceeded"))?.kind).toBe("rate-limited");
    expect(classifyIntegrationError(octokitError(502, "Bad Gateway"))?.kind).toBe("unavailable");
  });

  it("leaves an ordinary GitHub 404 alone — that may be our bug", () => {
    expect(classifyIntegrationError(octokitError(404, "Not Found"))).toBeNull();
  });

  it("classifies Notion's 'API token is invalid' as auth, through a wrapping Error's cause", () => {
    const notion = notionError(APIErrorCode.Unauthorized, 401, "API token is invalid.");
    expect(classifyIntegrationError(notion)).toMatchObject({ kind: "auth", provider: "Notion" });
    const wrapped = new Error("Failed to fetch projects from Notion Projects database", { cause: notion });
    expect(classifyIntegrationError(wrapped)).toMatchObject({ kind: "auth", provider: "Notion" });
  });

  it("classifies an unshared Notion database, a Notion outage and a Notion timeout", () => {
    expect(classifyIntegrationError(notionError(APIErrorCode.ObjectNotFound, 404, "nope"))?.kind).toBe("auth");
    expect(classifyIntegrationError(notionError(APIErrorCode.ServiceUnavailable, 503, "down"))?.kind).toBe("unavailable");
    expect(classifyIntegrationError(notionError(APIErrorCode.RateLimited, 429, "slow"))?.kind).toBe("rate-limited");
    expect(classifyIntegrationError(new RequestTimeoutError())?.kind).toBe("unavailable");
  });

  it("classifies our own IntegrationAuthError with its message", () => {
    const error = new IntegrationAuthError(
      "Google Calendar",
      "No Google Calendar access token found. Please connect your Google Calendar.",
    );
    expect(classifyIntegrationError(error)).toEqual({
      kind: "auth",
      provider: "Google Calendar",
      message: "No Google Calendar access token found. Please connect your Google Calendar.",
    });
  });

  it("classifies network failures and timeouts as unavailable", () => {
    const fetchFailed = new TypeError("fetch failed", {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    expect(classifyIntegrationError(fetchFailed, "Outlook Calendar")).toMatchObject({
      kind: "unavailable",
      provider: "Outlook Calendar",
    });
    expect(classifyIntegrationError(new TimeoutError("google.refreshAccessToken", 10_000))?.kind).toBe("unavailable");
    expect(classifyIntegrationError(new DOMException("signal timed out", "TimeoutError"))?.kind).toBe("unavailable");
  });

  it("ignores plain errors and deliberate tRPC errors", () => {
    expect(classifyIntegrationError(new Error("Invalid summary type"))).toBeNull();
    expect(classifyIntegrationError(new TRPCError({ code: "NOT_FOUND", cause: octokitError(401) }))).toBeNull();
    expect(classifyIntegrationError(undefined)).toBeNull();
  });

  it("looks inside tRPC's INTERNAL_SERVER_ERROR wrapper", () => {
    const wrapped = new TRPCError({ code: "INTERNAL_SERVER_ERROR", cause: octokitError(401) });
    expect(classifyIntegrationError(wrapped)?.kind).toBe("auth");
  });
});

describe("toIntegrationTRPCError", () => {
  it("maps each kind to its tRPC code and keeps the original as cause", () => {
    const original = octokitError(401);
    const auth = toIntegrationTRPCError(original);
    expect(auth?.code).toBe("PRECONDITION_FAILED");
    expect(auth?.cause).toBe(original);
    expect(toIntegrationTRPCError(octokitError(429, "slow down"))?.code).toBe("TOO_MANY_REQUESTS");
    expect(toIntegrationTRPCError(new TypeError("fetch failed"))?.code).toBe("BAD_GATEWAY");
  });

  it("only maps the requested kinds", () => {
    expect(toIntegrationTRPCError(new TypeError("fetch failed"), { kinds: ["auth"] })).toBeNull();
    expect(toIntegrationTRPCError(octokitError(401), { kinds: ["auth"] })?.code).toBe("PRECONDITION_FAILED");
  });

  it("returns null for errors that are not integration states", () => {
    expect(toIntegrationTRPCError(new Error("boom"))).toBeNull();
  });
});

describe("oauthRefreshFailure", () => {
  it("says reconnect only when the token endpoint rejected the grant", () => {
    for (const status of [400, 401]) {
      const error = oauthRefreshFailure("Google Calendar", status, new Error("invalid_grant"));
      expect(error).toBeInstanceOf(IntegrationAuthError);
      expect(error?.message).toBe("Failed to refresh access token. Please reconnect your Google Calendar.");
      expect(toIntegrationTRPCError(error)?.code).toBe("PRECONDITION_FAILED");
    }
  });

  it("says try again for a 429 or 5xx from the token endpoint", () => {
    for (const status of [429, 500, 503]) {
      const error = oauthRefreshFailure("Outlook Calendar", status, undefined);
      expect(error).toBeInstanceOf(IntegrationUnavailableError);
      expect(toIntegrationTRPCError(error)?.code).toBe("BAD_GATEWAY");
    }
  });

  it("returns null without a status, so the caller rethrows the original", () => {
    expect(oauthRefreshFailure("Google Calendar", undefined, new TypeError("fetch failed"))).toBeNull();
    expect(oauthRefreshFailure("Google Calendar", 403, new Error("x"))).toBeNull();
  });
});
