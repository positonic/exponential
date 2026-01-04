/**
 * Workspace Data Migration Script
 *
 * This script migrates existing user data to the new workspace structure:
 * 1. Creates a Personal workspace for each user
 * 2. Migrates all existing Projects, Goals, Outcomes, Actions to the Personal workspace
 * 3. Sets the defaultWorkspaceId on each user
 *
 * Run with: npx tsx prisma/migrations/workspace-data-migration.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateToWorkspaces() {
  console.log('Starting workspace migration...\n');

  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      defaultWorkspaceId: true,
    },
  });

  console.log(`Found ${users.length} users to migrate\n`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      // Check if user already has a personal workspace
      const existingPersonal = await prisma.workspace.findFirst({
        where: {
          type: 'personal',
          ownerId: user.id,
        },
      });

      if (existingPersonal) {
        console.log(`[SKIP] User ${user.email} already has personal workspace: ${existingPersonal.slug}`);
        skippedCount++;
        continue;
      }

      console.log(`[MIGRATE] Processing user: ${user.email}`);

      // Create personal workspace
      const slug = `personal-${user.id.slice(0, 8)}`;

      // Check if slug already exists (edge case)
      const existingSlug = await prisma.workspace.findUnique({
        where: { slug },
      });

      const finalSlug = existingSlug ? `personal-${user.id}` : slug;

      const workspace = await prisma.workspace.create({
        data: {
          name: 'Personal',
          slug: finalSlug,
          type: 'personal',
          ownerId: user.id,
          members: {
            create: {
              userId: user.id,
              role: 'owner',
            },
          },
        },
      });

      console.log(`  Created workspace: ${workspace.slug}`);

      // Migrate Projects
      const projectsUpdated = await prisma.project.updateMany({
        where: {
          createdById: user.id,
          workspaceId: null,
        },
        data: {
          workspaceId: workspace.id,
        },
      });
      console.log(`  Migrated ${projectsUpdated.count} projects`);

      // Migrate Goals
      const goalsUpdated = await prisma.goal.updateMany({
        where: {
          userId: user.id,
          workspaceId: null,
        },
        data: {
          workspaceId: workspace.id,
        },
      });
      console.log(`  Migrated ${goalsUpdated.count} goals`);

      // Migrate Outcomes
      const outcomesUpdated = await prisma.outcome.updateMany({
        where: {
          userId: user.id,
          workspaceId: null,
        },
        data: {
          workspaceId: workspace.id,
        },
      });
      console.log(`  Migrated ${outcomesUpdated.count} outcomes`);

      // Migrate Actions (created by user)
      const actionsUpdated = await prisma.action.updateMany({
        where: {
          createdById: user.id,
          workspaceId: null,
        },
        data: {
          workspaceId: workspace.id,
        },
      });
      console.log(`  Migrated ${actionsUpdated.count} actions`);

      // Set default workspace if not set
      if (!user.defaultWorkspaceId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { defaultWorkspaceId: workspace.id },
        });
        console.log(`  Set default workspace`);
      }

      migratedCount++;
      console.log(`  [DONE] User migration complete\n`);

    } catch (error) {
      console.error(`  [ERROR] Failed to migrate user ${user.email}:`, error);
      errorCount++;
    }
  }

  console.log('\n========================================');
  console.log('Migration Summary:');
  console.log(`  Total users: ${users.length}`);
  console.log(`  Migrated: ${migratedCount}`);
  console.log(`  Skipped (already had workspace): ${skippedCount}`);
  console.log(`  Errors: ${errorCount}`);
  console.log('========================================\n');
}

async function main() {
  try {
    await migrateToWorkspaces();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
