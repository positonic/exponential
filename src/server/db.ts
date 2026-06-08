import { PrismaClient } from "@prisma/client";

import { env } from "~/env";

const createPrismaClient = () => {
  // [DIAGNOSTIC] Slow-query logging (>300ms) — revert after Zoe hang investigation.
  if (env.NODE_ENV === "development") {
    const client = new PrismaClient({
      log: [{ emit: "event", level: "query" }, "error", "warn"],
    });
    const SLOW_QUERY_MS = 300;
    client.$on("query", (e) => {
      if (e.duration >= SLOW_QUERY_MS) {
        console.log(`⏱️ [slow-query] ${e.duration}ms ${e.query.slice(0, 200)}`);
      }
    });
    return client;
  }
  return new PrismaClient({ log: ["error"] });
};

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") globalForPrisma.prisma = db;
