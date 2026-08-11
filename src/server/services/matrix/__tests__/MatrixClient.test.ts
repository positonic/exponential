/**
 * Unit tests for the stateless Matrix Client-Server API wrapper.
 *
 * `fetch` is stubbed in the style of `MatrixNotificationService.test.ts`, including its
 * OK/ERR response helpers — no network, ever.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  MatrixApiError,
  MatrixClient,
  normalizeHomeserverUrl,
} from "~/server/services/matrix/MatrixClient";

const OK = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const ERR = (status: number, body: unknown = {}) =>
  ({ ok: false, status, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

function makeClient(overrides: { homeserverUrl?: string } = {}) {
  return new MatrixClient({
    homeserverUrl: overrides.homeserverUrl ?? "https://matrix.example.org",
    accessToken: "syt_secret",
    fetchImpl: fetchMock as unknown as typeof fetch,
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeHomeserverUrl", () => {
  it("strips trailing slashes and surrounding whitespace", () => {
    expect(normalizeHomeserverUrl("  https://matrix.example.org///  ")).toBe(
      "https://matrix.example.org",
    );
  });
});

describe("MatrixClient.whoami", () => {
  it("returns the token's owner and sends it as a bearer token", async () => {
    fetchMock.mockResolvedValue(OK({ user_id: "@summaries:example.org" }));

    await expect(makeClient().whoami()).resolves.toEqual({
      userId: "@summaries:example.org",
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://matrix.example.org/_matrix/client/v3/account/whoami",
    );
    expect((init as RequestInit).method).toBe("GET");
    expect(
      (init as Record<string, Record<string, string>>).headers.Authorization,
    ).toBe("Bearer syt_secret");
  });

  it("builds the same URL whether or not the homeserver URL has a trailing slash", async () => {
    fetchMock.mockResolvedValue(OK({ user_id: "@bot:example.org" }));
    await makeClient({ homeserverUrl: "https://matrix.example.org/" }).whoami();

    expect(String(fetchMock.mock.calls[0]![0])).toBe(
      "https://matrix.example.org/_matrix/client/v3/account/whoami",
    );
  });

  it("reports a rejected token as unauthorized, carrying the homeserver's errcode", async () => {
    fetchMock.mockResolvedValue(
      ERR(401, { errcode: "M_UNKNOWN_TOKEN", error: "Invalid access token" }),
    );

    const error = await makeClient()
      .whoami()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MatrixApiError);
    expect((error as MatrixApiError).isUnauthorized).toBe(true);
    expect((error as MatrixApiError).errcode).toBe("M_UNKNOWN_TOKEN");
    expect((error as MatrixApiError).message).toBe("Invalid access token");
  });

  it("distinguishes an unreachable homeserver (status 0) from a rejected request", async () => {
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const error = await makeClient()
      .whoami()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MatrixApiError);
    expect((error as MatrixApiError).status).toBe(0);
    expect((error as MatrixApiError).isUnauthorized).toBe(false);
    expect((error as MatrixApiError).message).toContain("Could not reach");
  });

  it("survives an error body that is not JSON (a proxy's HTML error page)", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    } as unknown as Response);

    const error = await makeClient()
      .whoami()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MatrixApiError);
    expect((error as MatrixApiError).status).toBe(502);
  });
});
