#!/usr/bin/env ts-node

/**
 * Migrate User Workspaces
 *
 * This script ensures all users have a personal workspace and a default workspace set:
 * 1. Creates personal workspaces for users who don't have one (even if they have team workspaces)
 * 2. Sets a default workspace for users who have workspaces but no default
 *
 * Run with: bun scripts/migrate-user-workspaces.ts
 */

// Load environment variables
import * as nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());

import { db } from '../src/server/db';

async function migrateUserWorkspaces() {
  console.log('Starting workspace migration...\n');

  // Step 1: Find users without a personal workspace (they may have team workspaces)
  const usersWithoutWorkspaces = await db.user.findMany({
    where: {
      ownedWorkspaces: {
        none: { type: "personal" }
      }
    },
    select: { id: true, name: true, email: true }
  });

  console.log(`Found ${usersWithoutWorkspaces.length} users without a personal workspace`);

  let createdCount = 0;
  for (const user of usersWithoutWorkspaces) {
    try {
      const slug = `personal-${user.id}`;

      // Use atomic transaction to create workspace and update user in one operation
      // This handles unique-slug conflicts and ensures both operations succeed or both roll back
      await db.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: {
            name: "Personal",
            slug,
            type: "personal",
            ownerId: user.id,
            members: {
              create: {
                userId: user.id,
                role: "owner",
              },
            },
          },
        });

        await tx.user.update({
          where: { id: user.id },
          data: { defaultWorkspaceId: workspace.id },
        });
      });

      createdCount++;
      console.log(`  Created workspace for: ${user.email ?? user.id}`);
    } catch (error) {
      // Handle unique constraint violations (slug already exists) and other errors
      console.error(`  Failed to create workspace for ${user.email ?? user.id}:`, error);
    }
  }

  console.log(`\nCreated ${createdCount} personal workspaces\n`);

  // Step 2: Set default workspace for users who have workspaces but no default
  const usersWithoutDefault = await db.user.findMany({
    where: {
      defaultWorkspaceId: null,
      workspaceMemberships: { some: {} }
    },
    include: {
      workspaceMemberships: {
        include: { workspace: true },
        orderBy: [
          { workspace: { type: "asc" } },  // personal workspaces first
          { workspace: { createdAt: "asc" } }  // oldest first
        ],
        take: 1
      }
    }
  });

  console.log(`Found ${usersWithoutDefault.length} users with workspaces but no default`);

  let defaultSetCount = 0;
  for (const user of usersWithoutDefault) {
    const firstMembership = user.workspaceMemberships[0];
    if (firstMembership) {
      try {
        await db.user.update({
          where: { id: user.id },
          data: { defaultWorkspaceId: firstMembership.workspaceId },
        });
        defaultSetCount++;
        console.log(`  Set default workspace for: ${user.email ?? user.id} -> ${firstMembership.workspace.name}`);
      } catch (error) {
        console.error(`  Failed to set default for ${user.email ?? user.id}:`, error);
      }
    }
  }

  console.log(`\nSet default workspace for ${defaultSetCount} users\n`);

  // Step 3: Verify - count remaining users without default workspace
  const remainingWithoutDefault = await db.user.count({
    where: { defaultWorkspaceId: null }
  });

  console.log('='.repeat(50));
  console.log('Migration Summary:');
  console.log(`  Personal workspaces created: ${createdCount}`);
  console.log(`  Default workspaces set: ${defaultSetCount}`);
  console.log(`  Users still without default: ${remainingWithoutDefault}`);
  console.log('='.repeat(50));

  if (remainingWithoutDefault > 0) {
    console.log('\nWarning: Some users still have no default workspace.');
    console.log('Run this script again or investigate manually.');
  } else {
    console.log('\nMigration complete! All users have a default workspace.');
  }
}

migrateUserWorkspaces()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
