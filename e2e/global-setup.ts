/**
 * Playwright global setup: seed the dev-fixture workspace, mint a session
 * cookie for the fixture user, and write both into e2e/.auth/ so every spec
 * starts authenticated with known data - no OAuth round-trip anywhere.
 *
 * Runs the same production/managed-DB guards as the fixture scripts, so this
 * suite physically cannot run against a non-local database.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadDevEnvOrThrow } from "../scripts/dev-fixture/env";

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".auth");

export default async function globalSetup() {
  loadDevEnvOrThrow();

  // Imported after env loading so PrismaClient sees the right DATABASE_URL.
  const { PrismaClient } = await import("@prisma/client");
  const { seedDevFixture, FIXTURE } = await import("../scripts/dev-fixture/seed");
  const { mintSessionCookie } = await import("../scripts/dev-fixture/session");

  const db = new PrismaClient();
  try {
    const fixture = await seedDevFixture(db);
    const session = await mintSessionCookie(db, { email: FIXTURE.userEmail });

    fs.mkdirSync(AUTH_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(AUTH_DIR, "storageState.json"),
      JSON.stringify({
        cookies: [
          {
            name: session.cookieName,
            value: session.cookieValue,
            domain: "localhost",
            path: "/",
            expires: Math.floor(session.expiresAt.getTime() / 1000),
            httpOnly: true,
            secure: false,
            sameSite: "Lax" as const,
          },
        ],
        origins: [],
      }),
    );
    // Seeded ids/urls for specs (imported via fixture-data helper).
    fs.writeFileSync(path.join(AUTH_DIR, "fixture.json"), JSON.stringify(fixture, null, 2));
  } finally {
    await db.$disconnect();
  }
}
