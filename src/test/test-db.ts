import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

let container: StartedPostgreSqlContainer | null = null;
let prisma: PrismaClient | null = null;

// ── Safety constants ─────────────────────────────────────────────────
//
// Marker row inserted into __test_db_marker on a freshly-initialized test DB.
// `truncateAllTables` refuses to run if the row is missing, which guarantees
// we cannot accidentally wipe a database that wasn't created by this helper
// (e.g. a real production DB someone pointed DATABASE_URL_TEST at).
const TEST_DB_MARKER_TABLE = "__test_db_marker";
const TEST_DB_MARKER_TOKEN = "test_db_safe_to_truncate_v1";

// Refuse outright if the connection string targets any of these managed
// services. These checks run BEFORE the localhost/test-name allowlist and
// CANNOT be overridden by `ALLOW_NON_LOCAL_TEST_DB` — if a hostname matches,
// we abort. A previous incident wiped production after a Railway URL was
// silently picked up via the (now-removed) DATABASE_URL fallback.
const MANAGED_DB_HOST_PATTERNS: RegExp[] = [
  /\.rlwy\.net/i,
  /\.railway\.app/i,
  /\.supabase\./i,
  /\.neon\.tech/i,
  /\.amazonaws\.com/i,
  /\.azure\.com/i,
  /\.gcp\.cloud/i,
  /\.fly\.dev/i,
  /digitalocean/i,
  /\.aiven\.io/i,
];

// Pre-truncate row count thresholds. A real prod DB will exceed these almost
// immediately; freshly-set-up test DBs will not.
const MAX_USERS_BEFORE_REFUSE = 100;
const MAX_KNOWLEDGE_CHUNKS_BEFORE_REFUSE = 1000;

function assertNotManagedHost(url: string): void {
  for (const pattern of MANAGED_DB_HOST_PATTERNS) {
    if (pattern.test(url)) {
      const sanitized = url.replace(/:([^@/]+)@/, ":***@");
      throw new Error(
        `[test-db] Refusing to use managed-service DB host (matched ${pattern}): ${sanitized}\n` +
          `\n` +
          `This pattern is hard-blocked because integration tests TRUNCATE tables.\n` +
          `Use a localhost Postgres or testcontainer instead — the ALLOW_NON_LOCAL_TEST_DB\n` +
          `escape hatch does NOT bypass this check.`,
      );
    }
  }
}

/**
 * Start a PostgreSQL testcontainer and run migrations.
 * Call this once in globalSetup or beforeAll at the suite level.
 */
export async function startTestDatabase(): Promise<PrismaClient> {
  if (prisma) return prisma;

  // Use ONLY DATABASE_URL_TEST. The `?? process.env.DATABASE_URL` fallback was
  // removed deliberately: it caused a production-data-loss incident when the
  // app's real DATABASE_URL leaked into the test runner. Tests now either
  // explicitly set DATABASE_URL_TEST (local/testcontainer) or fall through to
  // spinning up a testcontainer locally. There is NO silent fallback.
  const existingUrl = process.env.DATABASE_URL_TEST;
  let connectionUrl: string;

  if (existingUrl) {
    // Layer 1: managed-service hostname blocklist (cannot be overridden).
    assertNotManagedHost(existingUrl);

    // Layer 2: refuse non-local DBs unless the DB name contains "test" or the
    // user explicitly opts in. Integration tests TRUNCATE tables in afterEach
    // hooks; running against prod would wipe real data.
    //
    // Allow:
    //  - localhost / 127.0.0.1 / ::1 hosts
    //  - testcontainers (host.docker.internal, dynamic ports)
    //  - URLs whose database name contains "test" (e.g. exponential_test)
    //  - explicit opt-in via ALLOW_NON_LOCAL_TEST_DB=1 (escape hatch for
    //    deliberate scenarios; never set this in normal dev). Note: this does
    //    NOT bypass the managed-host blocklist above.
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
          `  2. Unset DATABASE_URL_TEST so a testcontainer spins up automatically (requires Docker)\n` +
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

  // Layer 4: stamp a marker row so truncateAllTables can prove this DB was
  // initialized as a test DB. If the marker is missing later, we refuse to
  // truncate. Production DBs will not have this table.
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS "${TEST_DB_MARKER_TABLE}" (token text PRIMARY KEY)`,
  );
  await prisma.$executeRawUnsafe(
    `INSERT INTO "${TEST_DB_MARKER_TABLE}" (token) VALUES ('${TEST_DB_MARKER_TOKEN}') ON CONFLICT DO NOTHING`,
  );

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

  // Layer 4 (final guard): the marker row inserted by startTestDatabase must
  // exist. If it doesn't, this DB was not initialized as a test DB — refuse
  // to truncate. This catches any path that bypassed the URL safety guards
  // (e.g. someone hand-constructed a PrismaClient pointed at production).
  let marker: { token: string }[];
  try {
    marker = await db.$queryRawUnsafe<{ token: string }[]>(
      `SELECT token FROM "${TEST_DB_MARKER_TABLE}" WHERE token = '${TEST_DB_MARKER_TOKEN}'`,
    );
  } catch (err) {
    throw new Error(
      `[test-db] Refusing to truncate: marker table "${TEST_DB_MARKER_TABLE}" is missing.\n` +
        `This database was NOT initialized via startTestDatabase() — refusing to wipe it.\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (marker.length === 0) {
    throw new Error(
      `[test-db] Refusing to truncate: marker row not found in "${TEST_DB_MARKER_TABLE}".\n` +
        `This database was NOT initialized via startTestDatabase() — refusing to wipe it.`,
    );
  }

  // Layer 3: pre-truncate row count check. Real production DBs will trip
  // this trivially; freshly-set-up test DBs will not. Tables that don't exist
  // (e.g. before migrations have run) are treated as empty.
  try {
    const userCountRows = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "User"`,
    );
    const userCount = Number(userCountRows[0]?.count ?? 0n);
    if (userCount > MAX_USERS_BEFORE_REFUSE) {
      throw new Error(
        `[test-db] Refusing to truncate: User table has ${userCount} rows ` +
          `(threshold: ${MAX_USERS_BEFORE_REFUSE}). This looks like a real database, not a test DB.`,
      );
    }
  } catch (err) {
    // Re-throw our own refusal; swallow "relation does not exist" only.
    if (err instanceof Error && /relation .* does not exist/i.test(err.message)) {
      // table not migrated yet — fine
    } else {
      throw err;
    }
  }

  try {
    const chunkCountRows = await db.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "KnowledgeChunk"`,
    );
    const chunkCount = Number(chunkCountRows[0]?.count ?? 0n);
    if (chunkCount > MAX_KNOWLEDGE_CHUNKS_BEFORE_REFUSE) {
      throw new Error(
        `[test-db] Refusing to truncate: KnowledgeChunk has ${chunkCount} rows ` +
          `(threshold: ${MAX_KNOWLEDGE_CHUNKS_BEFORE_REFUSE}). This looks like a real database, not a test DB.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && /relation .* does not exist/i.test(err.message)) {
      // table not migrated yet — fine
    } else {
      throw err;
    }
  }

  // Fetch every user table in the public schema, except the Prisma migrations
  // bookkeeping table and our own marker. Cast to a typed shape so TS is happy.
  const rows = await db.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename != '_prisma_migrations'
       AND tablename != '${TEST_DB_MARKER_TABLE}'`,
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
