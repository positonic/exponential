/**
 * ADR-0049 smoke-test seeder (local dev DB only).
 *
 * Creates a throwaway External agent owned by the given user, grants it one
 * workspace, mints a key, and prints the secret so the curl smoke test can
 * run. `--cleanup` removes everything it created.
 *
 *   npx tsx scripts/smoke-external-agent.ts <owner-email>
 *   npx tsx scripts/smoke-external-agent.ts <owner-email> --cleanup
 */
import { PrismaClient } from "@prisma/client";
import { generateExternalAgentKey } from "../src/server/utils/external-agent-keys";

const AGENT_NAME = "Smoke Test Agent";

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) {
    console.error("Usage: npx tsx scripts/smoke-external-agent.ts <owner-email> [--cleanup]");
    process.exit(1);
  }
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!/localhost|127\.0\.0\.1/.test(dbUrl)) {
    console.error("Refusing to run against a non-local DATABASE_URL");
    process.exit(1);
  }

  const db = new PrismaClient();
  const owner = await db.user.findUnique({ where: { email } });
  if (!owner) throw new Error(`No user with email ${email}`);

  if (flag === "--cleanup") {
    const agents = await db.externalAgent.findMany({
      where: { ownerId: owner.id, name: AGENT_NAME },
    });
    for (const agent of agents) {
      await db.externalAgentKey.deleteMany({ where: { agentId: agent.id } });
      await db.workspaceUser.deleteMany({ where: { userId: agent.shadowUserId } });
      await db.externalAgent.delete({ where: { id: agent.id } });
      await db.user.delete({ where: { id: agent.shadowUserId } }).catch(() => {
        console.log(`Shadow user ${agent.shadowUserId} retained (authored content)`);
      });
    }
    console.log(`Cleaned up ${agents.length} smoke-test agent(s)`);
    return;
  }

  const membership = await db.workspaceUser.findFirst({
    where: { userId: owner.id, role: { in: ["owner", "admin", "member"] } },
    include: { workspace: { select: { id: true, name: true, slug: true } } },
  });
  if (!membership) throw new Error("Owner has no workspace membership to delegate");

  const shadowUser = await db.user.create({
    data: { name: AGENT_NAME, isAgent: true },
  });
  const agent = await db.externalAgent.create({
    data: { name: AGENT_NAME, ownerId: owner.id, shadowUserId: shadowUser.id },
  });
  await db.workspaceUser.create({
    data: { userId: shadowUser.id, workspaceId: membership.workspace.id, role: "member" },
  });
  const generated = generateExternalAgentKey();
  await db.externalAgentKey.create({
    data: {
      agentId: agent.id,
      name: "smoke",
      keyHash: generated.hash,
      keyPrefix: generated.displayPrefix,
    },
  });

  console.log(JSON.stringify({
    agentId: agent.id,
    shadowUserId: shadowUser.id,
    workspace: membership.workspace,
    secret: generated.secret,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
