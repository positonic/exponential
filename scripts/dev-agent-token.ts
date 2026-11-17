/**
 * Mint an agent token for an existing local user: the `agent-context` JWT the
 * chat route hands to Mastra, so an agent's tools can call this app's tRPC API
 * as that user. Used by the Mastra repo's live smoke test.
 *
 *   npx tsx scripts/dev-agent-token.ts                     # fixture user; prints the token only
 *   npx tsx scripts/dev-agent-token.ts --email you@x.com   # any existing user
 *   npx tsx scripts/dev-agent-token.ts --json              # token, user and expiry
 *
 *   SMOKE_AUTH_TOKEN=$(npm run -s dev:agent-token) npm run smoke:live   # in the Mastra checkout
 *
 * Dev-only: refuses NODE_ENV=production and non-local databases (see
 * scripts/dev-fixture/env.ts). The token only works against a server sharing
 * this environment's AUTH_SECRET, and expires after 30 minutes.
 */
import { loadDevEnvOrThrow } from "./dev-fixture/env";

async function main() {
  loadDevEnvOrThrow();

  // Imported after env loading so PrismaClient sees the right DATABASE_URL.
  const { PrismaClient } = await import("@prisma/client");
  const { generateJWT, DEFAULT_EXPIRY } = await import("../src/server/utils/jwt");
  const { FIXTURE } = await import("./dev-fixture/seed");

  const args = process.argv.slice(2);
  const emailFlag = args.indexOf("--email");
  const email = emailFlag >= 0 ? args[emailFlag + 1] : FIXTURE.userEmail;
  if (!email) throw new Error("--email requires a value");

  const db = new PrismaClient();
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, image: true },
    });
    if (!user) {
      throw new Error(
        `[dev-agent-token] No user with email "${email}". ` +
          "This script never creates users - run scripts/seed-dev-fixture.ts first, " +
          "or pass the email of a user that already exists locally.",
      );
    }

    const token = generateJWT(user, { tokenType: "agent-context" });
    if (args.includes("--json")) {
      const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY["agent-context"] * 60_000);
      console.log(JSON.stringify({ token, userId: user.id, email: user.email, expiresAt }, null, 2));
    } else {
      // The token alone, so `$(npm run -s dev:agent-token)` can capture it.
      console.log(token);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
