import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
import { mockDeep, mockReset, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

vi.mock("~/server/db", () => ({ db: mockDeep<PrismaClient>() }));

import { db } from "~/server/db";
import { POST, GET, DELETE } from "../mappings/route";
import { POST as refreshToken } from "../refresh-token/route";
import {
  fakeIntegrationFindFirst,
  SYSTEM_MATRIX_INTEGRATION,
} from "~/test/matrixIntegrationFixtures";

const dbMock = db as unknown as DeepMockProxy<PrismaClient>;

const SECRET = "test-gateway-secret";
const URL_BASE = "http://localhost/api/matrix-gateway/mappings";

function makeRequest(
  method: "POST" | "GET" | "DELETE",
  opts: { body?: unknown; secret?: string; url?: string } = {},
): NextRequest {
  return new NextRequest(opts.url ?? URL_BASE, {
    method,
    ...(opts.body !== undefined
      ? { body: JSON.stringify(opts.body) }
      : {}),
    headers: opts.secret ? { "X-Gateway-Secret": opts.secret } : {},
  });
}

const integrationRow = {
  id: "int-matrix-1",
  provider: "matrix",
  status: "ACTIVE",
} as never;

beforeAll(() => {
  process.env.GATEWAY_SECRET = SECRET;
  process.env.AUTH_SECRET = "test-jwt-secret-for-unit-tests";
});

beforeEach(() => {
  mockReset(dbMock);
});

describe("POST /api/matrix-gateway/mappings", () => {
  it("rejects a missing gateway secret", async () => {
    const res = await POST(
      makeRequest("POST", { body: { mxid: "@a:b.c", userId: "u1" } }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects a wrong gateway secret", async () => {
    const res = await POST(
      makeRequest("POST", {
        body: { mxid: "@a:b.c", userId: "u1" },
        secret: "wrong",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("rejects an invalid mxid", async () => {
    const res = await POST(
      makeRequest("POST", {
        body: { mxid: "not-an-mxid", userId: "u1" },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("404s for an unknown user", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    const res = await POST(
      makeRequest("POST", {
        body: { mxid: "@james:syntro.fi", userId: "nope" },
        secret: SECRET,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("creates the system Integration row when none exists, then upserts the mapping", async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: "u1" } as never);
    dbMock.integration.findFirst.mockResolvedValue(null);
    dbMock.integration.create.mockResolvedValue(integrationRow);
    dbMock.integrationUserMapping.upsert.mockResolvedValue({
      externalUserId: "@james:syntro.fi",
      userId: "u1",
    } as never);

    const res = await POST(
      makeRequest("POST", {
        body: { mxid: "@james:syntro.fi", userId: "u1" },
        secret: SECRET,
      }),
    );

    expect(res.status).toBe(200);
    expect(dbMock.integration.create).toHaveBeenCalledTimes(1);
    expect(dbMock.integration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ provider: "matrix", status: "ACTIVE" }),
      }),
    );
    expect(dbMock.integrationUserMapping.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId_externalUserId: {
            integrationId: "int-matrix-1",
            externalUserId: "@james:syntro.fi",
          },
        },
      }),
    );
  });

  it("does NOT create a second Integration row when one exists (idempotent)", async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: "u1" } as never);
    dbMock.integration.findFirst.mockResolvedValue(integrationRow);
    dbMock.integrationUserMapping.upsert.mockResolvedValue({
      externalUserId: "@james:syntro.fi",
      userId: "u1",
    } as never);

    const res = await POST(
      makeRequest("POST", {
        body: { mxid: "@james:syntro.fi", userId: "u1" },
        secret: SECRET,
      }),
    );

    expect(res.status).toBe(200);
    expect(dbMock.integration.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/matrix-gateway/mappings", () => {
  it("rejects a missing gateway secret", async () => {
    const res = await GET(makeRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("returns an empty list before anything has paired", async () => {
    dbMock.integration.findFirst.mockResolvedValue(null);
    const res = await GET(makeRequest("GET", { secret: SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mappings: [] });
  });

  it("reads the system row's mappings, not a workspace Matrix server's", async () => {
    // A workspace-registered homeserver is an Integration with userId: null too,
    // so a lookup that forgets workspaceId: null can return it and hand the
    // gateway an empty (or foreign) mapping set.
    dbMock.integration.findFirst.mockImplementation(
      fakeIntegrationFindFirst() as never,
    );
    dbMock.integrationUserMapping.findMany.mockResolvedValue([
      { externalUserId: "@james:syntro.fi", userId: "u1" },
    ] as never);

    const res = await GET(makeRequest("GET", { secret: SECRET }));

    expect(await res.json()).toEqual({
      mappings: [{ mxid: "@james:syntro.fi", userId: "u1" }],
    });
    expect(dbMock.integrationUserMapping.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { integrationId: SYSTEM_MATRIX_INTEGRATION.id },
      }),
    );
  });

  it("returns persisted mappings as { mxid, userId }", async () => {
    dbMock.integration.findFirst.mockResolvedValue(integrationRow);
    dbMock.integrationUserMapping.findMany.mockResolvedValue([
      { externalUserId: "@james:syntro.fi", userId: "u1" },
      { externalUserId: "@friend:matrix.org", userId: "u2" },
    ] as never);

    const res = await GET(makeRequest("GET", { secret: SECRET }));
    expect(await res.json()).toEqual({
      mappings: [
        { mxid: "@james:syntro.fi", userId: "u1" },
        { mxid: "@friend:matrix.org", userId: "u2" },
      ],
    });
  });
});

describe("DELETE /api/matrix-gateway/mappings", () => {
  it("rejects a missing gateway secret", async () => {
    const res = await DELETE(
      makeRequest("DELETE", { body: { mxid: "@james:syntro.fi" } }),
    );
    expect(res.status).toBe(401);
  });

  it("removes one mapping and reports the count", async () => {
    dbMock.integration.findFirst.mockResolvedValue(integrationRow);
    dbMock.integrationUserMapping.deleteMany.mockResolvedValue({
      count: 1,
    } as never);

    const res = await DELETE(
      makeRequest("DELETE", {
        body: { mxid: "@james:syntro.fi" },
        secret: SECRET,
      }),
    );
    expect(await res.json()).toEqual({ deleted: 1 });
    expect(dbMock.integrationUserMapping.deleteMany).toHaveBeenCalledWith({
      where: {
        integrationId: "int-matrix-1",
        externalUserId: "@james:syntro.fi",
      },
    });
  });
});

describe("POST /api/matrix-gateway/refresh-token", () => {
  const REFRESH_URL = "http://localhost/api/matrix-gateway/refresh-token";

  it("rejects a missing gateway secret", async () => {
    const res = await refreshToken(
      makeRequest("POST", { body: { userId: "u1" }, url: REFRESH_URL }),
    );
    expect(res.status).toBe(401);
  });

  it("404s for an unknown user", async () => {
    dbMock.user.findUnique.mockResolvedValue(null);
    const res = await refreshToken(
      makeRequest("POST", {
        body: { userId: "nope" },
        secret: SECRET,
        url: REFRESH_URL,
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns a fresh matrix-gateway JWT for a known user", async () => {
    dbMock.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "u1@example.com",
      name: "U One",
      image: null,
    } as never);

    const res = await refreshToken(
      makeRequest("POST", {
        body: { userId: "u1" },
        secret: SECRET,
        url: REFRESH_URL,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { token: string; expiresAt: string };
    expect(json.token).toBeTruthy();
    expect(new Date(json.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const [, payloadB64] = json.token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadB64!, "base64url").toString(),
    ) as Record<string, unknown>;
    expect(payload.aud).toBe("matrix-gateway");
    expect(payload.tokenType).toBe("matrix-gateway");
    expect(payload.sub).toBe("u1");
  });
});
