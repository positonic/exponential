/**
 * One-off backfill: set TranscriptionSession.workspaceId from the linked project.
 *
 * A project-linked Meeting always inherits its Project's Workspace
 * (CONTEXT.md → Meeting↔Workspace). Manual transcripts uploaded from a Project
 * page were saved with workspaceId NULL even though their Project sat in a
 * Workspace, which broke participant management ("Cannot manage participants on
 * a meeting with no workspace"). The mutation now derives the workspace; this
 * backfills the rows that already landed in the incoherent state.
 *
 * For every TranscriptionSession where workspaceId IS NULL AND projectId IS NOT NULL,
 * copies workspaceId from the row's Project (Project.workspaceId).
 *
 * Rows with no projectId (legitimately "personal" meetings), or whose project
 * has no workspaceId, are left as null.
 *
 * Usage:
 *   npx tsx scripts/backfill-transcription-workspace.ts           # dry-run (default)
 *   npx tsx scripts/backfill-transcription-workspace.ts --apply   # actually update
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}\n`);

  const rows = await db.transcriptionSession.findMany({
    where: {
      workspaceId: null,
      projectId: { not: null },
    },
    select: {
      id: true,
      sessionId: true,
      projectId: true,
      project: { select: { workspaceId: true } },
    },
  });

  console.log(
    `Found ${rows.length} candidate meetings (workspaceId null, projectId set)\n`,
  );

  let skippedNoProjectWorkspace = 0;
  let totalUpdated = 0;

  for (const row of rows) {
    const workspaceId = row.project?.workspaceId;
    if (!workspaceId) {
      // Project itself has no workspace — leave the meeting alone rather than
      // inventing a workspace. Surfaced so a human can investigate.
      skippedNoProjectWorkspace++;
      console.log(
        `  SKIP  meeting=${row.id} (${row.sessionId}) project=${row.projectId} has no workspaceId`,
      );
      continue;
    }

    if (apply) {
      // Re-check workspaceId: null in the where clause so a concurrent write
      // can't be clobbered, and so a re-run is idempotent.
      const result = await db.transcriptionSession.updateMany({
        where: { id: row.id, workspaceId: null },
        data: { workspaceId },
      });
      console.log(
        `  ${result.count ? "OK   " : "NOOP "} meeting=${row.id} (${row.sessionId}) → workspace=${workspaceId}`,
      );
      totalUpdated += result.count;
    } else {
      console.log(
        `  WOULD meeting=${row.id} (${row.sessionId}) → workspace=${workspaceId}`,
      );
      totalUpdated++;
    }
  }

  console.log(
    `\nMeetings skipped (project has no workspaceId): ${skippedNoProjectWorkspace}`,
  );
  console.log(`${apply ? "Updated" : "Would update"}: ${totalUpdated} meetings`);
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
