#!/usr/bin/env ts-node

/**
 * Audit Slack User Mappings
 * 
 * This script identifies potentially unauthorized Slack user mappings by:
 * 1. Finding mappings where the Slack user isn't a team member (if integration has a team)
 * 2. Identifying mappings that don't follow expected naming conventions
 * 3. Checking for suspicious patterns in the mappings
 * 
 * Run with: bun scripts/audit-slack-mappings.ts
 */

// Load environment variables
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db } from '../src/server/db';

interface SuspiciousMapping {
  id: string;
  slackUserId: string;
  systemUserId: string;
  systemUserEmail: string;
  systemUserName: string;
  integrationId: string;
  integrationName: string;
  teamName: string | null;
  reason: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

async function auditSlackMappings() {
  console.log('🔍 Starting Slack user mapping audit...\n');

  try {
    // Get all Slack integrations with their user mappings
    const integrations = await db.integration.findMany({
      where: { provider: 'slack' },
      include: {
        userMappings: {
          include: {
            user: true
          }
        },
        team: {
          include: {
            members: {
              include: {
                user: true
              }
            }
          }
        },
        user: true
      }
    });

    const suspiciousMappings: SuspiciousMapping[] = [];
    let totalMappings = 0;
    let teamBasedMappings = 0;
    let personalMappings = 0;

    for (const integration of integrations) {
      totalMappings += integration.userMappings.length;
      
      if (integration.team) {
        teamBasedMappings += integration.userMappings.length;
        console.log(`🏢 Team Integration: "${integration.name}" (Team: ${integration.team.name})`);
        console.log(`   Team members: ${integration.team.members.length}`);
        console.log(`   Slack mappings: ${integration.userMappings.length}`);
        
        // Get list of team member user IDs
        const teamMemberUserIds = new Set(integration.team.members.map(m => m.userId));
        
        // Check each mapping
        for (const mapping of integration.userMappings) {
          if (!teamMemberUserIds.has(mapping.userId)) {
            suspiciousMappings.push({
              id: mapping.id,
              slackUserId: mapping.externalUserId,
              systemUserId: mapping.userId,
              systemUserEmail: mapping.user.email || 'N/A',
              systemUserName: mapping.user.name || 'N/A',
              integrationId: integration.id,
              integrationName: integration.name,
              teamName: integration.team?.name || null,
              reason: 'User mapped to team integration but is not a team member',
              severity: 'HIGH'
            });
          }
          
          // Check for naming convention mismatches (if we have names)
          if (mapping.user.email && mapping.user.name) {
            const userEmail = mapping.user.email.toLowerCase();
            const userName = mapping.user.name.toLowerCase();
            
            // Basic heuristic: check if user email/name doesn't seem to match typical patterns
            // This is just for flagging review, not for automatic deletion
            const emailUsername = userEmail.split('@')[0] || '';
            const hasCommonDomain = userEmail.includes('@gmail.com') || userEmail.includes('@hotmail.com') || userEmail.includes('@outlook.com');
            
            if (hasCommonDomain && integration.team) {
              suspiciousMappings.push({
                id: mapping.id,
                slackUserId: mapping.externalUserId,
                systemUserId: mapping.userId,
                systemUserEmail: mapping.user.email,
                systemUserName: mapping.user.name,
                integrationId: integration.id,
                integrationName: integration.name,
                teamName: integration.team?.name || null,
                reason: 'Personal email domain mapped to team integration (may be legitimate)',
                severity: 'LOW'
              });
            }
          }
        }
      } else {
        personalMappings += integration.userMappings.length;
        console.log(`👤 Personal Integration: "${integration.name}" (Owner: ${integration.user?.name || 'Unknown'})`);
        console.log(`   Slack mappings: ${integration.userMappings.length}`);
        
        // For personal integrations, check if the mapping is to someone other than the owner
        for (const mapping of integration.userMappings) {
          if (integration.userId && mapping.userId !== integration.userId) {
            suspiciousMappings.push({
              id: mapping.id,
              slackUserId: mapping.externalUserId,
              systemUserId: mapping.userId,
              systemUserEmail: mapping.user.email || 'N/A',
              systemUserName: mapping.user.name || 'N/A',
              integrationId: integration.id,
              integrationName: integration.name,
              teamName: null,
              reason: 'User mapped to personal integration that belongs to someone else',
              severity: 'MEDIUM'
            });
          }
        }
      }
      console.log();
    }

    // Summary
    console.log('📊 AUDIT SUMMARY:');
    console.log(`   Total Slack integrations: ${integrations.length}`);
    console.log(`   Total user mappings: ${totalMappings}`);
    console.log(`   Team-based mappings: ${teamBasedMappings}`);
    console.log(`   Personal mappings: ${personalMappings}`);
    console.log(`   Suspicious mappings found: ${suspiciousMappings.length}\n`);

    if (suspiciousMappings.length === 0) {
      console.log('✅ No suspicious mappings found! All mappings appear legitimate.');
    } else {
      console.log('⚠️  SUSPICIOUS MAPPINGS DETECTED:');
      console.log('=' .repeat(80));
      
      // Group by severity
      const bySeverity = {
        HIGH: suspiciousMappings.filter(m => m.severity === 'HIGH'),
        MEDIUM: suspiciousMappings.filter(m => m.severity === 'MEDIUM'),
        LOW: suspiciousMappings.filter(m => m.severity === 'LOW')
      };

      for (const [severity, mappings] of Object.entries(bySeverity)) {
        if (mappings.length === 0) continue;
        
        console.log(`\n🚨 ${severity} PRIORITY (${mappings.length} issues):`);
        console.log('-'.repeat(50));
        
        mappings.forEach((mapping, index) => {
          console.log(`${index + 1}. Slack User: ${mapping.slackUserId}`);
          console.log(`   System User: ${mapping.systemUserName} (${mapping.systemUserEmail})`);
          console.log(`   Integration: ${mapping.integrationName}${mapping.teamName ? ` (Team: ${mapping.teamName})` : ''}`);
          console.log(`   Reason: ${mapping.reason}`);
          console.log(`   Mapping ID: ${mapping.id}`);
          console.log();
        });
      }

      console.log('\n🔧 RECOMMENDED ACTIONS:');
      console.log('- HIGH priority items should be investigated immediately');
      console.log('- Review team memberships and ensure proper access controls');
      console.log('- Consider removing unauthorized mappings using:');
      console.log('  await db.integrationUserMapping.delete({ where: { id: "MAPPING_ID" } })');
      console.log('- For team integrations, ensure users are actual team members');
      console.log();
      
      console.log('⚠️  WARNING: Do not automatically delete mappings - always verify first!');
      console.log('   Some mappings may be legitimate (consultants, external team members, etc.)');
    }

    console.log('\n✅ Audit completed.');

  } catch (error) {
    console.error('❌ Error during audit:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

// Run the audit if this script is executed directly
if (import.meta.main) {
  auditSlackMappings().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { auditSlackMappings };