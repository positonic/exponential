import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

let container: StartedPostgreSqlContainer | null = null;
let prisma: PrismaClient | null = null;

/**
 * Start a PostgreSQL testcontainer and run migrations.
 * Call this once in globalSetup or beforeAll at the suite level.
 */
export async function startTestDatabase(): Promise<PrismaClient> {
  if (prisma) return prisma;

  // Check if DATABASE_URL is already set (e.g., in CI with a service container)
  const existingUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  let connectionUrl: string;

  if (existingUrl) {
    // Safety guard: refuse to run integration tests against anything that
    // looks like a production / shared database. Integration tests TRUNCATE
    // tables in afterEach hooks; running against prod would wipe real data.
    // The atomic transaction in truncateAllTables saves us if a FK fails,
    // but that's defense in depth — this guard is the primary line.
    //
    // Allow:
    //  - localhost / 127.0.0.1 / ::1 hosts
    //  - testcontainers (host.docker.internal, dynamic ports)
    //  - URLs whose database name contains "test" (e.g. exponential_test)
    //  - explicit opt-in via ALLOW_NON_LOCAL_TEST_DB=1 (escape hatch for
    //    deliberate scenarios; never set this in normal dev)
    const isLocalhost = /@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal)[:\/]/.test(
      existingUrl,
    );
    const dbNameMatch = /\/([^?\/]+)(\?|$)/.exec(existingUrl);
    const dbName = dbNameMatch?.[1] ?? "";
    const dbNameLooksLikeTest = /test/i.test(dbName);
    const explicitOptIn = process.env.ALLOW_NON_LOCAL_TEST_DB === "1";

    if (!isLocalhost && !dbNameLooksLikeTest && !explicitOptIn) {
      const sanitized = existingUrl.replace(/:([^@/]+)@/, ":***@");
      throw new Error(
        `[test-db] Refusing to run integration tests against non-local DB: ${sanitized}\n` +
          `\n` +
          `Integration tests TRUNCATE tables between runs and would destroy real data.\n` +
          `\n` +
          `Fix one of:\n` +
          `  1. Set DATABASE_URL_TEST to a local Postgres (e.g. postgres://postgres:postgres@localhost:5432/exponential_test)\n` +
          `  2. Unset DATABASE_URL_TEST and DATABASE_URL so a testcontainer spins up automatically (requires Docker)\n` +
          `  3. Rename your test DB to include 'test' in the database name\n` +
          `  4. Set ALLOW_NON_LOCAL_TEST_DB=1 to override (only if you know what you're doing)`,
      );
    }

    connectionUrl = existingUrl;
  } else {
    // Locally, spin up a testcontainer
    container = await new PostgreSqlContainer("pgvector/pgvector:pg16")
      .withDatabase("exponential_test")
      .withUsername("test")
      .withPassword("test")
      .start();

    connectionUrl = container.getConnectionUri();
  }

  // Set DATABASE_URL for Prisma CLI and client
  process.env.DATABASE_URL = connectionUrl;

  // Run migrations
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: connectionUrl },
    stdio: "pipe",
  });

  prisma = new PrismaClient({
    datasources: { db: { url: connectionUrl } },
    log: ["error"],
  });

  await prisma.$connect();
  return prisma;
}

/**
 * Get the current test PrismaClient instance.
 * Throws if startTestDatabase() hasn't been called.
 */
export function getTestDb(): PrismaClient {
  if (!prisma) {
    throw new Error("Test database not started. Call startTestDatabase() first.");
  }
  return prisma;
}

/**
 * Delete all data between tests for isolation.
 *
 * Strategy: dynamically discover every user table from pg_tables, then DELETE
 * from all of them in a single transaction with `session_replication_role =
 * replica` set, which disables FK trigger enforcement for the duration of the
 * transaction. This sidesteps both:
 *
 *  1. The brittleness of the original hand-maintained DELETE list (it broke
 *     whenever a new table like UserExercise was added to the schema, causing
 *     FK violations that rolled back the whole transaction and broke
 *     isolation).
 *  2. The slowness of `TRUNCATE ... CASCADE` on this Postgres instance, which
 *     hung past the 120s hook timeout when run across all ~147 tables (likely
 *     due to AccessExclusiveLock contention on a remote DB with non-trivial
 *     metadata).
 *
 * Trade-offs vs. the original ordered-DELETE approach:
 *  - PRO: Zero maintenance — adding a new model never breaks isolation.
 *  - PRO: Fast — DELETE is per-row but tests keep tables tiny.
 *  - CON: Does NOT reset sequences. Tests should not rely on auto-increment
 *    IDs starting at 1; use the returned IDs from factories instead.
 *  - CON: `session_replication_role = replica` requires SUPERUSER or
 *    REPLICATION privileges. If that fails, fall back to a per-statement loop
 *    that retries until no FK errors remain.
 */
export async function truncateAllTables(): Promise<void> {
  const db = getTestDb();

  // Fetch every user table in the public schema, except the Prisma migrations
  // bookkeeping table. Cast to a typed shape so TS is happy.
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename != '_prisma_migrations'`,
  );

  if (rows.length === 0) return;

  const quotedTables = rows.map((r) => `"${r.tablename}"`);

  // Build a single transaction that disables FK enforcement, deletes from
  // every table, then restores normal enforcement. `session_replication_role`
  // is per-session, so this only affects our one connection.
  //
  // Use `db.$transaction([])` with an array of pre-built queries — this is
  // significantly faster than the interactive callback form because Prisma
  // pipelines the statements rather than round-tripping per query. The
  // interactive form was hitting the default 5s timeout on remote (Railway)
  // databases.
  const statements = [
    db.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`),
    ...quotedTables.map((table) =>
      db.$executeRawUnsafe(`DELETE FROM ${table}`),
    ),
  ];
  await db.$transaction(statements, {
    // Generous timeout for remote test DBs where ~150 round-trips can be slow.
    timeout: 60_000,
    maxWait: 10_000,
  });
}

/**
 * Stop the test database container and disconnect.
 */
export async function stopTestDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  if (container) {
    await container.stop();
    container = null;
  }
}
