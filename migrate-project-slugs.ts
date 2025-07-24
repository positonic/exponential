#!/usr/bin/env tsx

import { db } from './src/server/db';

/**
 * Migration script to update project slugs from hyphen format to underscore format
 * 
 * Changes:
 * - "akashic-1" → "akashic_1"
 * - "project-name-2" → "project-name_2"
 * 
 * This ensures consistent parsing for ActionList and other components.
 */
async function migrateProjectSlugs() {
  console.log('🔄 Starting project slug migration...\n');

  try {
    // Find all projects with numeric suffixes in their slugs
    const projects = await db.project.findMany({
      select: {
        id: true,
        slug: true,
        name: true,
      }
    });

    console.log(`📊 Found ${projects.length} projects to evaluate`);

    let updatedCount = 0;
    const updates: Array<{ id: string; oldSlug: string; newSlug: string }> = [];

    for (const project of projects) {
      // Check if slug has numeric suffix with hyphen (e.g., "name-1", "name-2")
      const match = project.slug.match(/^(.+)-(\d+)$/);
      
      if (match) {
        const [, baseName, number] = match;
        const newSlug = `${baseName}_${number}`;
        
        // Check if the new slug would conflict with an existing one
        const existingProject = await db.project.findFirst({
          where: {
            slug: newSlug,
            id: { not: project.id }
          }
        });

        if (existingProject) {
          console.log(`⚠️  Skipping ${project.slug} → ${newSlug} (conflict with existing project)`);
          continue;
        }

        updates.push({
          id: project.id,
          oldSlug: project.slug,
          newSlug: newSlug
        });
      }
    }

    console.log(`\n📋 Found ${updates.length} projects to update:`);
    updates.forEach(update => {
      console.log(`   ${update.oldSlug} → ${update.newSlug}`);
    });

    if (updates.length === 0) {
      console.log('✅ No projects need migration!');
      return;
    }

    // Prompt for confirmation
    console.log('\n⚠️  This will update project slugs in the database.');
    console.log('   Make sure to update any hardcoded URLs in your application.');
    
    // For safety, let's do a dry run first
    console.log('\n🔍 DRY RUN - No changes will be made yet');
    console.log('   Remove the dry run check in the script to apply changes');
    
    // Uncomment the following section to actually perform the migration:
    /*
    console.log('\n🚀 Applying changes...');
    
    for (const update of updates) {
      await db.project.update({
        where: { id: update.id },
        data: { slug: update.newSlug }
      });
      
      console.log(`✅ Updated: ${update.oldSlug} → ${update.newSlug}`);
      updatedCount++;
    }
    
    console.log(`\n🎉 Migration completed! Updated ${updatedCount} project slugs.`);
    */

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Run the migration
migrateProjectSlugs()
  .then(() => {
    console.log('\n✨ Migration script finished');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration script failed:', error);
    process.exit(1);
  });