/**
 * Cleanup Script: Remove CRM starter automations from all workspaces except one.
 *
 * The CRM Automations page used to auto-seed two "starter" onboarding automations
 * ("Channel Partner onboarding", "Advisor onboarding") into a workspace the first
 * time anyone opened its Automations page. That auto-seed has been removed, but the
 * starters it already created in other workspaces remain. This script deletes those
 * leftover starters everywhere EXCEPT the keep-workspace (default: `butterflies`).
 *
 * Starters are identified by `triggerType = crm.contact.customer_type` AND
 * `config.isDefault = true`. Deleting a WorkflowDefinition cascades to its steps,
 * runs, and step-runs (all `onDelete: Cascade`).
 *
 * Dry-run by default — pass `--delete` to actually remove rows.
 *
 *   # Dry run (lists what would be deleted):
 *   DATABASE_URL="<target-db-url>" npx tsx scripts/cleanup-crm-starter-automations.ts
 *
 *   # Execute the deletion:
 *   DATABASE_URL="<target-db-url>" npx tsx scripts/cleanup-crm-starter-automations.ts --delete
 *
 * Override the keep-workspace slug with --keep=<slug> (default: butterflies).
 */

// Reads DATABASE_URL straight from the environment — pass it on the command line
// (e.g. DATABASE_URL="..." npx tsx scripts/cleanup-crm-starter-automations.ts).
import { PrismaClient } from '@prisma/client';

import { CRM_CONTACT_TYPE_TRIGGER } from '../src/server/services/crm/automation/triggerResolver';

const db = new PrismaClient();

function getKeepSlug(): string {
  const arg = process.argv.find((a) => a.startsWith('--keep='));
  return arg ? arg.slice('--keep='.length) : 'butterflies';
}

async function cleanupStarterAutomations() {
  const keepSlug = getKeepSlug();
  const shouldDelete = process.argv.includes('--delete');

  console.log(
    `🔍 Cleaning up CRM starter automations (keeping workspace "${keepSlug}")...`,
  );

  // Safety: make sure the keep-workspace actually exists before touching anything.
  const keepWorkspace = await db.workspace.findFirst({
    where: { slug: keepSlug },
    select: { id: true, slug: true, name: true },
  });

  if (!keepWorkspace) {
    console.error(
      `❌ Keep-workspace "${keepSlug}" not found. Aborting — refusing to run without a confirmed workspace to preserve.`,
    );
    console.error(
      `   Pass the correct slug with --keep=<slug>, e.g. --keep=butterflies`,
    );
    return;
  }

  console.log(
    `✅ Keep-workspace found: ${keepWorkspace.name} (${keepWorkspace.slug})`,
  );

  // Find starter automations in every OTHER workspace.
  const candidates = await db.workflowDefinition.findMany({
    where: {
      triggerType: CRM_CONTACT_TYPE_TRIGGER,
      config: { path: ['isDefault'], equals: true },
      workspace: { slug: { not: keepSlug } },
    },
    select: {
      id: true,
      name: true,
      workspace: { select: { slug: true, name: true } },
    },
    orderBy: [{ workspace: { slug: 'asc' } }, { name: 'asc' }],
  });

  console.log(
    `\n📊 Found ${candidates.length} starter automation(s) to remove (outside "${keepSlug}"):`,
  );
  for (const c of candidates) {
    console.log(`   • [${c.workspace.slug}] ${c.name} (${c.id})`);
  }

  if (candidates.length === 0) {
    console.log('\n✅ Nothing to clean up.');
    return;
  }

  if (!shouldDelete) {
    console.log(
      `\nℹ️  Dry run — no rows deleted. Re-run with --delete to remove the ${candidates.length} automation(s) above.`,
    );
    return;
  }

  console.log(`\n🗑️  Deleting ${candidates.length} starter automation(s)...`);
  const result = await db.workflowDefinition.deleteMany({
    where: { id: { in: candidates.map((c) => c.id) } },
  });
  console.log(`✅ Deleted ${result.count} automation(s) (steps/runs cascaded).`);
}

cleanupStarterAutomations()
  .then(() => {
    console.log('\n✅ Done.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
