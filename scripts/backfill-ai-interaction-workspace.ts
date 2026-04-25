/**
 * One-off backfill: set AiInteractionHistory.workspaceId from the linked project.
 *
 * For every AiInteractionHistory row where workspaceId IS NULL AND projectId IS NOT NULL,
 * copies workspaceId from the row's Project (Project.workspaceId).
 *
 * Rows with no projectId, or whose project has no workspaceId, are left as null.
 *
 * Usage:
 *   npx tsx scripts/backfill-ai-interaction-workspace.ts           # dry-run (default)
 *   npx tsx scripts/backfill-ai-interaction-workspace.ts --apply   # actually update
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  const rows = await db.aiInteractionHistory.findMany({
    where: {
      workspaceId: null,
      projectId: { not: null },
    },
    select: {
      id: true,
      projectId: true,
      project: { select: { workspaceId: true } },
    },
  });

  console.log(`Found ${rows.length} candidate rows (workspaceId null, projectId set)\n`);

  // Group by projectId → workspaceId mapping
  const projectToWorkspace = new Map<string, string>();
  let skippedNoProjectWorkspace = 0;

  for (const row of rows) {
    if (!row.projectId) continue;
    const wsId = row.project?.workspaceId;
    if (!wsId) {
      skippedNoProjectWorkspace++;
      continue;
    }
    projectToWorkspace.set(row.projectId, wsId);
  }

  console.log(`Distinct projects to backfill: ${projectToWorkspace.size}`);
  console.log(`Rows skipped (project has no workspaceId): ${skippedNoProjectWorkspace}\n`);

  let totalUpdated = 0;
  for (const [projectId, workspaceId] of projectToWorkspace) {
    if (apply) {
      const result = await db.aiInteractionHistory.updateMany({
        where: { projectId, workspaceId: null },
        data: { workspaceId },
      });
      console.log(`  project=${projectId} → workspace=${workspaceId}: updated ${result.count}`);
      totalUpdated += result.count;
    } else {
      const count = await db.aiInteractionHistory.count({
        where: { projectId, workspaceId: null },
      });
      console.log(`  project=${projectId} → workspace=${workspaceId}: would update ${count}`);
      totalUpdated += count;
    }
  }

  console.log(`\n${apply ? "Updated" : "Would update"}: ${totalUpdated} rows`);
  if (!apply) {
    console.log("\nRe-run with --apply to commit changes.");
  }
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
