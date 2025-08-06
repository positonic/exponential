/**
 * Cleanup Script: Remove Unauthorized Slack User Mappings
 * 
 * This script removes IntegrationUserMapping entries that were created by the 
 * identity substitution vulnerability where unknown Slack users were mapped 
 * to integration installers.
 * 
 * RUN WITH CAUTION: This will remove mappings that may be legitimate.
 * Always backup the database before running this script.
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function cleanupUnauthorizedMappings() {
  console.log('🔍 Analyzing Slack user mappings for unauthorized entries...');
  
  try {
    // Get all Slack integration mappings
    const slackMappings = await db.integrationUserMapping.findMany({
      include: {
        integration: {
          include: {
            team: {
              include: {
                members: {
                  include: {
                    user: true
                  }
                }
              }
            },
            user: true // Integration installer
          }
        },
        user: true
      },
      where: {
        integration: {
          provider: 'slack'
        }
      }
    });

    console.log(`📊 Found ${slackMappings.length} Slack user mappings to analyze`);

    let suspiciousCount = 0;
    let confirmedUnauthorized = 0;
    const suspiciousMappings = [];

    for (const mapping of slackMappings) {
      const integration = mapping.integration;
      const mappedUser = mapping.user;
      const installer = integration.user;

      // Check if mapped user is the integration installer
      if (mappedUser.id === installer?.id) {
        // This could be legitimate if installer is actually using Slack
        // OR it could be from the vulnerability fallback
        
        // Additional checks:
        const isTeamMember = integration.team?.members.some(tm => tm.user.id === mappedUser.id);
        const isInstaller = mappedUser.id === installer.id;
        
        if (isInstaller && !isTeamMember && integration.team) {
          // Suspicious: Installer mapped but not in team
          suspiciousMappings.push({
            mappingId: mapping.id,
            slackUserId: mapping.externalUserId,
            mappedTo: mappedUser.email,
            reason: 'Installer mapped but not team member',
            severity: 'HIGH - Likely unauthorized'
          });
          suspiciousCount++;
        } else if (isInstaller) {
          // Potentially suspicious: Multiple Slack users mapped to same installer
          const sameUserMappings = slackMappings.filter(m => m.user.id === mappedUser.id);
          if (sameUserMappings.length > 1) {
            suspiciousMappings.push({
              mappingId: mapping.id,
              slackUserId: mapping.externalUserId,
              mappedTo: mappedUser.email,
              reason: `${sameUserMappings.length} Slack users mapped to same person`,
              severity: 'MEDIUM - Possibly unauthorized'
            });
            suspiciousCount++;
          }
        }
      }
    }

    console.log(`\n🚨 SECURITY ANALYSIS RESULTS:`);
    console.log(`   Suspicious mappings found: ${suspiciousCount}`);
    
    if (suspiciousMappings.length > 0) {
      console.log(`\n📋 SUSPICIOUS MAPPINGS:`);
      suspiciousMappings.forEach((mapping, index) => {
        console.log(`   ${index + 1}. ${mapping.severity}`);
        console.log(`      Mapping ID: ${mapping.mappingId}`);
        console.log(`      Slack User: ${mapping.slackUserId}`);
        console.log(`      Mapped to: ${mapping.mappedTo}`);
        console.log(`      Reason: ${mapping.reason}`);
        console.log('');
      });

      console.log(`\n⚠️  MANUAL REVIEW REQUIRED:`);
      console.log(`   Review the mappings above and determine which should be removed.`);
      console.log(`   Run with --delete flag to remove HIGH severity mappings:`);
      console.log(`   \n   bun run scripts/cleanup-unauthorized-slack-mappings.ts --delete\n`);
    } else {
      console.log(`✅ No obviously unauthorized mappings detected.`);
    }

    // Check for --delete flag
    const shouldDelete = process.argv.includes('--delete');
    if (shouldDelete) {
      const highSeverityMappings = suspiciousMappings.filter(m => 
        m.severity.startsWith('HIGH')
      );
      
      if (highSeverityMappings.length > 0) {
        console.log(`\n🗑️  DELETING ${highSeverityMappings.length} HIGH severity unauthorized mappings...`);
        
        const mappingIds = highSeverityMappings.map(m => m.mappingId);
        const deleteResult = await db.integrationUserMapping.deleteMany({
          where: {
            id: {
              in: mappingIds
            }
          }
        });
        
        console.log(`✅ Deleted ${deleteResult.count} unauthorized mappings`);
        confirmedUnauthorized = deleteResult.count;
      } else {
        console.log(`ℹ️  No HIGH severity mappings to delete.`);
      }
    }

    console.log(`\n📈 CLEANUP SUMMARY:`);
    console.log(`   Total mappings analyzed: ${slackMappings.length}`);
    console.log(`   Suspicious mappings found: ${suspiciousCount}`);
    console.log(`   Unauthorized mappings removed: ${confirmedUnauthorized}`);
    console.log(`   Remaining mappings: ${slackMappings.length - confirmedUnauthorized}`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  } finally {
    await db.$disconnect();
  }
}

// Run the cleanup
if (require.main === module) {
  cleanupUnauthorizedMappings()
    .then(() => {
      console.log('\n✅ Cleanup analysis completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Cleanup failed:', error);
      process.exit(1);
    });
}

export { cleanupUnauthorizedMappings };