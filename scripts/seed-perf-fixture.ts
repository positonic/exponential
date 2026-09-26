/**
 * Bulk-seed the `dev-fixture` workspace for the perf harness (e2e/perf/).
 *
 *   npx tsx scripts/seed-perf-fixture.ts
 *
 * Run after `npm run dev:seed-fixture`. Idempotent and dev-only, with the same
 * guards as the other fixture scripts (scripts/dev-fixture/env.ts).
 */
import { loadDevEnvOrThrow } from "./dev-fixture/env";

async function main() {
  loadDevEnvOrThrow();

  const { PrismaClient } = await import("@prisma/client");
  const { seedPerfVolume, PERF_VOLUME } = await import("./dev-fixture/seed-perf");

  const db = new PrismaClient();
  try {
    const { skipped } = await seedPerfVolume(db);
    console.log(
      skipped
        ? "Perf volume already seeded - skipped."
        : `Seeded perf volume into dev-fixture: ${JSON.stringify(PERF_VOLUME)}`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
