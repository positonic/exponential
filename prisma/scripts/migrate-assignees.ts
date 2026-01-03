/**
 * Migration Script: Ensure all actions with assignedToId have corresponding ActionAssignee records
 *
 * This script is part of the assignment system consolidation from dual (assignedToId + assignees)
 * to single (assignees only) system.
 *
 * Run with: npx tsx prisma/scripts/migrate-assignees.ts
 *
 * Options:
 *   --dry-run  Show what would be created without making changes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface MigrationStats {
  totalActionsWithAssignedTo: number;
  alreadyHasAssignee: number;
  created: number;
  errors: number;
}

async function migrateAssignees(dryRun: boolean): Promise<MigrationStats> {
  const stats: MigrationStats = {
    totalActionsWithAssignedTo: 0,
    alreadyHasAssignee: 0,
    created: 0,
    errors: 0,
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(dryRun ? '  DRY RUN MODE - No changes will be made' : '  LIVE MODE - Changes will be committed');
  console.log(`${'='.repeat(60)}\n`);

  // Find all actions that have assignedToId set
  const actionsWithAssignedTo = await prisma.action.findMany({
    where: {
      assignedToId: { not: null },
    },
    select: {
      id: true,
      name: true,
      assignedToId: true,
      assignees: {
        select: {
          userId: true,
        },
      },
    },
  });

  stats.totalActionsWithAssignedTo = actionsWithAssignedTo.length;
  console.log(`Found ${stats.totalActionsWithAssignedTo} actions with assignedToId set\n`);

  for (const action of actionsWithAssignedTo) {
    const assignedToId = action.assignedToId!;

    // Check if ActionAssignee record already exists for this user
    const existingAssignee = action.assignees.find(a => a.userId === assignedToId);

    if (existingAssignee) {
      stats.alreadyHasAssignee++;
      console.log(`  [SKIP] Action "${action.name}" (${action.id}) - already has ActionAssignee for ${assignedToId}`);
      continue;
    }

    // Create ActionAssignee record
    if (dryRun) {
      console.log(`  [WOULD CREATE] ActionAssignee for action "${action.name}" (${action.id}) -> user ${assignedToId}`);
      stats.created++;
    } else {
      try {
        await prisma.actionAssignee.create({
          data: {
            actionId: action.id,
            userId: assignedToId,
          },
        });
        console.log(`  [CREATED] ActionAssignee for action "${action.name}" (${action.id}) -> user ${assignedToId}`);
        stats.created++;
      } catch (error) {
        console.error(`  [ERROR] Failed to create ActionAssignee for action ${action.id}:`, error);
        stats.errors++;
      }
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('\n========================================');
  console.log('  ActionAssignee Migration Script');
  console.log('========================================');
  console.log('\nPurpose: Ensure all actions with assignedToId have corresponding ActionAssignee records');
  console.log('This is part of the consolidation from dual assignment system to single (assignees only).\n');

  try {
    const stats = await migrateAssignees(dryRun);

    console.log('\n----------------------------------------');
    console.log('  Summary');
    console.log('----------------------------------------');
    console.log(`  Total actions with assignedToId: ${stats.totalActionsWithAssignedTo}`);
    console.log(`  Already had ActionAssignee:      ${stats.alreadyHasAssignee}`);
    console.log(`  ${dryRun ? 'Would create' : 'Created'}:                      ${stats.created}`);
    if (stats.errors > 0) {
      console.log(`  Errors:                          ${stats.errors}`);
    }
    console.log('----------------------------------------\n');

    if (dryRun && stats.created > 0) {
      console.log('To apply these changes, run without --dry-run flag:\n');
      console.log('  npx tsx prisma/scripts/migrate-assignees.ts\n');
    }

    if (!dryRun && stats.created > 0) {
      console.log('Migration complete! ActionAssignee records have been created.\n');
    }

  } catch (error) {
    console.error('\nMigration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
