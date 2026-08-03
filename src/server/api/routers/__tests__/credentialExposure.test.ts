/**
 * Regression tests for the 2026-07-30 integration-secrets audit (V1):
 * no tRPC procedure may return an `IntegrationCredential` row (its `key`
 * holds raw or encrypted secrets — Meta access tokens, API keys, bot tokens).
 *
 * Two layers:
 *
 * 1. Compile-time: `LeakyProcedures` recursively walks every procedure's
 *    inferred output type and collects any `"router.procedure"` whose payload
 *    contains a credential-shaped object (`key` + `keyType` + `isEncrypted`).
 *    Reintroducing `credentials: true` into a returned payload makes
 *    `LeakyProcedures` non-`never`, and the `AssertNever` alias below stops
 *    `npm run check` / CI with the offending procedure names in the error.
 *
 * 2. Runtime: the procedures deleted by the audit stay deleted.
 *
 * Uses `vitest-mock-extended`'s `mockDeep<PrismaClient>()` — no real DB, ever
 * (see CLAUDE.md "Test database safety").
 */

import { describe, it, expect, vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";
import type { inferRouterOutputs } from "@trpc/server";

vi.hoisted(() => {
  process.env.OPENAI_API_KEY ??= "sk-test-dummy";
  process.env.AUTH_SECRET ??= "test-secret-for-unit-tests";
  process.env.SKIP_ENV_VALIDATION ??= "true";
  process.env.NODE_ENV ??= "test";
  process.env.GOOGLE_CLIENT_ID ??= "test";
  process.env.GOOGLE_CLIENT_SECRET ??= "test";
  process.env.MASTRA_API_URL ??= "http://localhost:4111";
  process.env.AUTH_DISCORD_ID ??= "test";
  process.env.AUTH_DISCORD_SECRET ??= "test";
  process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
  process.env.DATABASE_ENCRYPTION_KEY ??= "0".repeat(64);
});

vi.mock("openai", () => ({
  default: class MockOpenAI {
    constructor(_opts?: unknown) {
      // intentionally empty
    }
  },
}));

vi.mock("next-auth", () => ({
  default: () => ({ auth: () => null, handlers: {}, signIn: vi.fn(), signOut: vi.fn() }),
}));
vi.mock("next-auth/providers/discord", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/google", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/notion", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/postmark", () => ({ default: vi.fn() }));
vi.mock("next-auth/providers/microsoft-entra-id", () => ({ default: vi.fn() }));

vi.mock("~/server/auth", () => ({
  auth: () => null,
  handlers: {},
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const dbHolder: { current: DeepMockProxy<PrismaClient> | null } = { current: null };
function getDbMock(): DeepMockProxy<PrismaClient> {
  if (!dbHolder.current) dbHolder.current = mockDeep<PrismaClient>();
  return dbHolder.current;
}
vi.mock("~/server/db", () => {
  const proxy = new Proxy(
    {},
    {
      get(_t, prop) {
        const m = getDbMock() as unknown as Record<string | symbol, unknown>;
        return m[prop as string];
      },
    },
  );
  return { db: proxy };
});

import { appRouter, type AppRouter } from "~/server/api/root";

// ---------------------------------------------------------------------------
// Compile-time guard
// ---------------------------------------------------------------------------

type IsAny<T> = 0 extends 1 & T ? true : false;

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

/**
 * An IntegrationCredential row is the only payload shape in the app carrying
 * `key` + `keyType` + `isEncrypted` together (see prisma/schema.prisma).
 */
type IsCredentialShaped<T> = T extends {
  key: unknown;
  keyType: unknown;
  isEncrypted: unknown;
}
  ? true
  : false;

type DeepFindsCredential<T, Depth extends unknown[] = []> = IsAny<T> extends true
  ? false
  : Depth["length"] extends 10
    ? false
    : T extends Primitive | Date | ((...args: never[]) => unknown)
      ? false
      : T extends (infer U)[]
        ? DeepFindsCredential<U, [...Depth, 1]>
        : T extends object
          ? IsCredentialShaped<T> extends true
            ? true
            : true extends {
                  [K in keyof T]-?: DeepFindsCredential<T[K], [...Depth, 1]>;
                }[keyof T]
              ? true
              : false
          : false;

type RouterOutputs = inferRouterOutputs<AppRouter>;

/**
 * Union of `"router.procedure"` names whose output type contains an
 * IntegrationCredential-shaped object. Must be `never`.
 */
type LeakyProcedures = {
  [R in keyof RouterOutputs]: {
    [P in keyof RouterOutputs[R]]: DeepFindsCredential<RouterOutputs[R][P]> extends true
      ? `${R & string}.${P & string}`
      : never;
  }[keyof RouterOutputs[R]];
}[keyof RouterOutputs];

type AssertNever<T extends never> = T;
// If this line errors, the type argument names the procedures returning
// credential rows — remove `credentials` from their returned payloads.
type _NoProcedureReturnsCredentials = AssertNever<LeakyProcedures>;

// ---------------------------------------------------------------------------
// Runtime guard: audit-deleted procedures stay deleted
// ---------------------------------------------------------------------------

describe("integration credential exposure (V1 audit regressions)", () => {
  const procedurePaths = Object.keys(
    (appRouter._def as unknown as { procedures: Record<string, unknown> }).procedures,
  );

  it("can introspect the router (sanity check)", () => {
    expect(procedurePaths.length).toBeGreaterThan(0);
    expect(procedurePaths).toContain("integration.listIntegrations");
  });

  it.each([
    "integration.getWhatsAppConfigByPhoneNumberId",
    "integration.storeWhatsAppMessage",
    "integration.updateWhatsAppMessageStatus",
    "integration.getFirefliesApiKey",
  ])("audit-deleted procedure %s does not exist", (path) => {
    expect(procedurePaths).not.toContain(path);
  });
});
