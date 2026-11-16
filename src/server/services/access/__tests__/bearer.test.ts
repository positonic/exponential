/**
 * `bearerTokenFrom`: reading the token out of an `Authorization` header, for
 * both the tRPC context and the hosted MCP endpoint.
 */

import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
});
vi.mock("~/server/db", () => ({ db: {} }));

import { bearerTokenFrom } from "../bearer";

function withAuthorization(value?: string): Headers {
  return new Headers(value === undefined ? {} : { authorization: value });
}

describe("bearerTokenFrom", () => {
  it.each(["Bearer", "bearer", "BEARER", "bEaReR"])("reads the token after the %s scheme", (scheme) => {
    expect(bearerTokenFrom(withAuthorization(`${scheme} exp_agent_abc`))).toBe("exp_agent_abc");
  });

  it("tolerates more than one space after the scheme", () => {
    expect(bearerTokenFrom(withAuthorization("Bearer   exp_agent_abc"))).toBe("exp_agent_abc");
  });

  it.each([
    ["no header", undefined],
    ["an empty header", ""],
    ["the scheme alone", "Bearer"],
    ["the scheme and spaces", "Bearer    "],
    ["another scheme", "Basic dXNlcjpwYXNz"],
    ["no space after the scheme", "Bearerexp_agent_abc"],
  ])("returns null for %s", (_label, value) => {
    expect(bearerTokenFrom(withAuthorization(value))).toBeNull();
  });
});
