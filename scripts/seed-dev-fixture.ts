/**
 * Seed the disposable `dev-fixture` workspace for visual verification.
 *
 *   npx tsx scripts/seed-dev-fixture.ts
 *
 * Idempotent - safe to re-run. Dev-only: refuses NODE_ENV=production and
 * non-local databases (see scripts/dev-fixture/env.ts). To remove everything,
 * delete the `dev-fixture` workspace (cascades) and the fixture user.
 */
import { loadDevEnvOrThrow } from "./dev-fixture/env";

async function main() {
  loadDevEnvOrThrow();

  const { PrismaClient } = await import("@prisma/client");
  const { seedDevFixture, FIXTURE } = await import("./dev-fixture/seed");

  const db = new PrismaClient();
  try {
    const fixture = await seedDevFixture(db);
    console.log(`Seeded fixture workspace "${FIXTURE.workspaceSlug}"`);
    console.log(`  user:            ${FIXTURE.userEmail}`);
    console.log(`  feature tickets: ${fixture.featureTicketCount} (of ${fixture.totalTicketCount} seeded - one is scope-only and excluded by design)`);
    console.log(`  feature page:    ${fixture.featureUrl}`);
    console.log(`  peek view:       ${fixture.peekUrl}`);
    console.log(`  okr dashboard:   ${fixture.okrUrl}`);
    console.log(`\nMint a session for the fixture user with:\n  npx tsx scripts/dev-session.ts`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
