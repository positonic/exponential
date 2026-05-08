import type { PrismaClient } from "@prisma/client";
import { createCaller } from "~/server/api/root";
import { getTestDb } from "./test-db";

/**
 * Create a tRPC caller authenticated as the given user.
 * Uses createCaller from root.ts to exercise the full middleware chain.
 *
 * NOTE: This helper depends on a real (test) Postgres via `getTestDb()`. Use it
 * ONLY from `*.integration.test.ts` files that opt into the integration runner
 * (see vitest.config.ts). For unit tests with a mocked Prisma client, use
 * `createMockCaller` instead.
 */
export function createTestCaller(userId: string, overrides?: { email?: string; name?: string; isAdmin?: boolean }) {
  const db = getTestDb();

  return createCaller({
    db,
    session: {
      user: {
        id: userId,
        email: overrides?.email ?? `${userId}@test.com`,
        name: overrides?.name ?? "Test User",
        image: null,
        isAdmin: overrides?.isAdmin ?? false,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    headers: new Headers(),
  });
}

/**
 * Create a tRPC caller backed by an injected (mocked) PrismaClient.
 *
 * Intended for unit tests that use `vitest-mock-extended`'s
 * `mockDeep<PrismaClient>()`. Pass the mock as `db` and stub the methods you
 * need per test — no real database is ever touched.
 *
 * The caller of this helper is also responsible for `vi.mock("~/server/db",
 * ...)`-ing the global db import so any code path that reads `~/server/db`
 * directly (e.g. resolvers) sees the same mock.
 */
export function createMockCaller(opts: {
  userId: string;
  db: PrismaClient;
  email?: string;
  name?: string;
  isAdmin?: boolean;
}) {
  return createCaller({
    db: opts.db,
    session: {
      user: {
        id: opts.userId,
        email: opts.email ?? `${opts.userId}@test.com`,
        name: opts.name ?? "Test User",
        image: null,
        isAdmin: opts.isAdmin ?? false,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
    headers: new Headers(),
  });
}

/**
 * Create an unauthenticated tRPC caller (no session).
 * Useful for testing public procedures or verifying auth guards.
 */
export function createUnauthenticatedCaller() {
  const db = getTestDb();

  return createCaller({
    db,
    session: null,
    headers: new Headers(),
  });
}

// ── Query Counter ────────────────────────────────────────────────────

interface QueryLog {
  count: number;
  queries: string[];
}

/**
 * Create a Prisma client wrapper that counts queries.
 * Used for N+1 detection in integration tests.
 *
 * Usage:
 *   const counter = createQueryCounter();
 *   // ... run tRPC procedure ...
 *   expect(counter.getCount()).toBeLessThan(10);
 */
export function createQueryCounter(): {
  getCount: () => number;
  getLog: () => QueryLog;
  reset: () => void;
  attachTo: (db: PrismaClient) => void;
} {
  let queryCount = 0;
  const queries: string[] = [];

  return {
    getCount: () => queryCount,
    getLog: () => ({ count: queryCount, queries }),
    reset: () => {
      queryCount = 0;
      queries.length = 0;
    },
    attachTo: (db: PrismaClient) => {
      // Prisma $use middleware for query counting
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db as any).$use(async (params: any, next: any) => {
        queryCount++;
        queries.push(`${params.model}.${params.action}`);
        return next(params);
      });
    },
  };
}
