/**
 * Mint a NextAuth session cookie for an existing local user - no OAuth.
 *
 *   npx tsx scripts/dev-session.ts                       # fixture user
 *   npx tsx scripts/dev-session.ts --email you@x.com     # any existing user
 *   npx tsx scripts/dev-session.ts --json                # machine-readable
 *
 * Dev-only: refuses NODE_ENV=production and non-local databases (see
 * scripts/dev-fixture/env.ts). The cookie only works against a server sharing
 * this environment's AUTH_SECRET.
 */
import { loadDevEnvOrThrow } from "./dev-fixture/env";

async function main() {
  loadDevEnvOrThrow();

  // Imported after env loading so PrismaClient sees the right DATABASE_URL.
  const { PrismaClient } = await import("@prisma/client");
  const { mintSessionCookie } = await import("./dev-fixture/session");
  const { FIXTURE } = await import("./dev-fixture/seed");

  const args = process.argv.slice(2);
  const emailFlag = args.indexOf("--email");
  const email = emailFlag >= 0 ? args[emailFlag + 1] : FIXTURE.userEmail;
  if (!email) throw new Error("--email requires a value");

  const db = new PrismaClient();
  try {
    const session = await mintSessionCookie(db, { email });
    if (args.includes("--json")) {
      console.log(JSON.stringify(session, null, 2));
    } else {
      console.log(`User:    ${session.email} (${session.userId})`);
      console.log(`Expires: ${session.expiresAt.toISOString()}`);
      console.log(`Cookie:  ${session.cookieName}=${session.cookieValue}`);
      console.log(`\ncurl example:\n  curl -H "Cookie: ${session.cookieName}=${session.cookieValue}" http://localhost:3000/`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
