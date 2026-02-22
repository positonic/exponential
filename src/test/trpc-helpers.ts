import type { PrismaClient } from "@prisma/client";
import { createCaller } from "~/server/api/root";
import { getTestDb } from "./test-db";

/**
 * Create a tRPC caller authenticated as the given user.
 * Uses createCaller from root.ts to exercise the full middleware chain.
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
