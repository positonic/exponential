import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

let container: StartedPostgreSqlContainer | null = null;
let prisma: PrismaClient | null = null;

/**
 * Refuse to operate on any DB URL that doesn't look like a test database.
 *
 * Background: on 2026-05-02 a developer machine ran `npm run test:integration`
 * with prod DATABASE_URL in .env and no DATABASE_URL_TEST override. The
 * fallback at startTestDatabase() silently used prod, then truncateAllTables()
 * wiped production data. This guard refuses any URL that isn't clearly a test
 * target so the same misconfiguration fails fast instead.
 *
 * Allowed:
 *   - CI === "true" (GitHub Actions sets this on every runner)
 *   - localhost / 127.0.0.1 / ::1 hosts (dev + testcontainer)
 *   - URLs whose path or host segment contains _test or -test
 */
function assertTestDatabase(url: string): void {
  const looksLikeTest =
    process.env.CI === "true" ||
    /\b(localhost|127\.0\.0\.1|::1)\b/.test(url) ||
    /[_-]test(\b|[_-])/i.test(url);

  if (!looksLikeTest) {
    const redacted = url.replace(/:\/\/[^@]*@/, "://***@");
    throw new Error(
      `[test-db] Refusing to use ${redacted} — does not look like a test ` +
        `database. Set DATABASE_URL_TEST to an explicit test DB or run ` +
        `integration tests in CI (which sets CI=true).`,
    );
  }
}

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
    // Use provided database URL (CI service container or local DATABASE_URL_TEST)
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

  // Refuse before we touch the DB (migrations, truncates, anything).
  assertTestDatabase(connectionUrl);

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
 * Uses DELETE (not TRUNCATE) to avoid AccessExclusiveLock overhead,
 * which is much faster for the small datasets in tests.
 * Tables are ordered to respect foreign key constraints.
 */
export async function truncateAllTables(): Promise<void> {
  const db = getTestDb();

  // Defense-in-depth: re-check the live DATABASE_URL right before issuing
  // destructive SQL, even though startTestDatabase() already gated it. If
  // something somehow swapped the env between setup and afterEach, refuse.
  const liveUrl = process.env.DATABASE_URL;
  if (liveUrl) assertTestDatabase(liveUrl);

  // Delete in dependency order (children before parents) to avoid FK violations.
  // This is faster than TRUNCATE CASCADE for small test datasets.
  await db.$transaction([
    db.$executeRawUnsafe(`DELETE FROM "ActionAssignee"`),
    db.$executeRawUnsafe(`DELETE FROM "ActionTag"`),
    db.$executeRawUnsafe(`DELETE FROM "Action"`),
    // Product Management plugin tables (children before parents)
    db.$executeRawUnsafe(`DELETE FROM "TicketDependency"`),
    db.$executeRawUnsafe(`DELETE FROM "TicketTag"`),
    db.$executeRawUnsafe(`DELETE FROM "FeatureTag"`),
    db.$executeRawUnsafe(`DELETE FROM "TicketComment"`),
    db.$executeRawUnsafe(`DELETE FROM "FeatureInsight"`),
    db.$executeRawUnsafe(`DELETE FROM "InsightTag"`),
    db.$executeRawUnsafe(`DELETE FROM "Insight"`),
    db.$executeRawUnsafe(`DELETE FROM "Retrospective"`),
    db.$executeRawUnsafe(`DELETE FROM "Ticket"`),
    db.$executeRawUnsafe(`DELETE FROM "TicketTemplate"`),
    db.$executeRawUnsafe(`DELETE FROM "UserStory"`),
    db.$executeRawUnsafe(`DELETE FROM "FeatureScope"`),
    db.$executeRawUnsafe(`DELETE FROM "Research"`),
    db.$executeRawUnsafe(`DELETE FROM "Feature"`),
    db.$executeRawUnsafe(`DELETE FROM "Product"`),
    // Existing tables
    db.$executeRawUnsafe(`DELETE FROM "Outcome"`),
    db.$executeRawUnsafe(`DELETE FROM "Goal"`),
    // TranscriptionSession references Project (no onDelete) and Workspace,
    // so its rows (and Screenshot/Participant children) must go first.
    db.$executeRawUnsafe(`DELETE FROM "Screenshot"`),
    db.$executeRawUnsafe(`DELETE FROM "TranscriptionSessionParticipant"`),
    db.$executeRawUnsafe(`DELETE FROM "TranscriptionSession"`),
    db.$executeRawUnsafe(`DELETE FROM "ProjectMember"`),
    db.$executeRawUnsafe(`DELETE FROM "Project"`),
    db.$executeRawUnsafe(`DELETE FROM "TeamUser"`),
    db.$executeRawUnsafe(`DELETE FROM "Team"`),
    db.$executeRawUnsafe(`DELETE FROM "WorkspaceUser"`),
    db.$executeRawUnsafe(`DELETE FROM "Workspace"`),
    db.$executeRawUnsafe(`DELETE FROM "Account"`),
    db.$executeRawUnsafe(`DELETE FROM "Session"`),
    db.$executeRawUnsafe(`DELETE FROM "User"`),
  ]);
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
