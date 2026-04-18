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
