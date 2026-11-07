/**
 * Read-only report: which Assistant each person keeps, and which are retired,
 * when one Assistant per person lands (ADR-0072). Run it against production
 * BEFORE `20261011200100_retire_duplicate_assistants`, so the survivors are
 * known (the PRD's open question "which Assistant survives, per affected
 * person"). The ranking is `planAssistantRetirement`'s, which the migration's
 * SQL mirrors.
 *
 * Meant for the pre-migration schema: it reads no `retiredAt`, so after the
 * migration it would count retired Assistants as candidates again.
 *
 * Makes NO writes. Usage:
 *   npx tsx scripts/plan-assistant-retirement.ts
 */

import { PrismaClient } from "@prisma/client";
import { buildWorkspaceAccessWhere } from "../src/server/services/access/resolvers/workspaceResolver";
import { planAssistantRetirement } from "../src/server/services/assistant/retirementPlan";

const db = new PrismaClient();

async function main() {
  // No `retiredAt` filter: this runs before the migration adds the column,
  // when nothing is retired yet (the select names only pre-existing columns).
  const assistants = await db.assistant.findMany({
    select: {
      id: true,
      name: true,
      workspaceId: true,
      isDefault: true,
      updatedAt: true,
      createdById: true,
      workspace: { select: { slug: true } },
    },
  });

  const byOwner = new Map<string, typeof assistants>();
  for (const assistant of assistants) {
    const list = byOwner.get(assistant.createdById) ?? [];
    list.push(assistant);
    byOwner.set(assistant.createdById, list);
  }
  const affected = [...byOwner.entries()].filter(([, list]) => list.length > 1);

  console.log(
    `${assistants.length} Assistant(s) across ${byOwner.size} person(s); ` +
      `${affected.length} person(s) hold more than one.\n`,
  );

  let retiring = 0;
  for (const [ownerId, list] of affected) {
    const [owner, accessible] = await Promise.all([
      db.user.findUnique({
        where: { id: ownerId },
        select: { name: true, email: true, defaultWorkspaceId: true },
      }),
      db.workspace.findMany({
        where: { id: { in: list.map((a) => a.workspaceId) }, ...buildWorkspaceAccessWhere(ownerId) },
        select: { id: true },
      }),
    ]);
    const canAccess = new Set(accessible.map((w) => w.id));
    const plan = planAssistantRetirement(
      list.map((a) => ({ ...a, ownerHasAccess: canAccess.has(a.workspaceId) })),
      { defaultWorkspaceId: owner?.defaultWorkspaceId ?? null },
    );
    if (!plan) continue;
    retiring += plan.retireIds.length;

    console.log(`${owner?.name ?? "(no name)"} <${owner?.email ?? ownerId}>`);
    for (const a of list) {
      const verdict = a.id === plan.survivorId ? "KEEP  " : "RETIRE";
      const flags = [
        a.isDefault ? "default" : null,
        a.workspaceId === owner?.defaultWorkspaceId ? "default-workspace" : null,
        canAccess.has(a.workspaceId) ? null : "workspace-left",
      ].filter(Boolean);
      console.log(
        `  ${verdict} ${a.name} (${a.id}) in ${a.workspace.slug}, edited ${a.updatedAt.toISOString()}` +
          (flags.length ? ` [${flags.join(", ")}]` : ""),
      );
    }
    console.log("");
  }

  console.log(`The migration would retire ${retiring} Assistant(s).`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void db.$disconnect();
  });
