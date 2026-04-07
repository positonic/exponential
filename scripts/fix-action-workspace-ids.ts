/**
 * Backfill script: Fix actions with null or mismatched workspaceId.
 *
 * For every action that has a projectId, sets workspaceId to match
 * the project's workspaceId.
 *
 * Usage:
 *   npx tsx scripts/fix-action-workspace-ids.ts          # dry-run (default)
 *   npx tsx scripts/fix-action-workspace-ids.ts --apply   # actually update
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  // Find all actions with a project, including the project's workspaceId
  const actions = await db.action.findMany({
    where: {
      projectId: { not: null },
    },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      project: { select: { workspaceId: true } },
    },
  });

  let alreadyCorrect = 0;
  let noProjectWorkspace = 0;
  const toFix: Array<{ id: string; currentWsId: string | null; correctWsId: string }> = [];

  for (const action of actions) {
    const projectWsId = action.project?.workspaceId;

    if (!projectWsId) {
      noProjectWorkspace++;
      continue;
    }

    if (action.workspaceId === projectWsId) {
      alreadyCorrect++;
      continue;
    }

    toFix.push({
      id: action.id,
      currentWsId: action.workspaceId,
      correctWsId: projectWsId,
    });
  }

  console.log(`Total actions with projects: ${actions.length}`);
  console.log(`Already correct:             ${alreadyCorrect}`);
  console.log(`Project has no workspace:     ${noProjectWorkspace}`);
  console.log(`Need fixing:                  ${toFix.length}`);

  // Show breakdown of current values
  const breakdown = new Map<string, number>();
  for (const a of toFix) {
    const key = a.currentWsId ?? "NULL";
    breakdown.set(key, (breakdown.get(key) ?? 0) + 1);
  }
  if (breakdown.size > 0) {
    console.log(`\nBreakdown of incorrect values:`);
    for (const [key, count] of breakdown) {
      console.log(`  ${key}: ${count}`);
    }
  }

  if (!apply) {
    console.log(`\nDry-run complete. Run with --apply to fix.`);
    return;
  }

  // Apply fixes in batches
  const BATCH_SIZE = 500;
  let fixed = 0;

  for (let i = 0; i < toFix.length; i += BATCH_SIZE) {
    const batch = toFix.slice(i, i + BATCH_SIZE);

    // Group by target workspaceId for efficient bulk updates
    const byTarget = new Map<string, string[]>();
    for (const item of batch) {
      const ids = byTarget.get(item.correctWsId) ?? [];
      ids.push(item.id);
      byTarget.set(item.correctWsId, ids);
    }

    for (const [wsId, actionIds] of byTarget) {
      const result = await db.action.updateMany({
        where: { id: { in: actionIds } },
        data: { workspaceId: wsId },
      });
      fixed += result.count;
    }

    console.log(`  Updated ${Math.min(i + BATCH_SIZE, toFix.length)}/${toFix.length}...`);
  }

  console.log(`\n✅ Fixed ${fixed} actions.`);
}

void main()
  .catch(console.error)
  .finally(() => void db.$disconnect());
