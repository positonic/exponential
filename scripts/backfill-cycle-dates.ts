#!/usr/bin/env ts-node

/**
 * Backfill start/end dates on undated cycles (SPRINT lists).
 *
 * Cycles auto-created by the Notion ticket import (ticketSync/resolvers
 * `resolveCycleIdByName`) carry a name and slug but NO dates. Undated cycles
 * break the Metrics page two ways:
 *
 *   - the "Metrics by cycle" chart orders by startDate (undated fall to the
 *     end, in createdAt order — i.e. import order, which can be reversed), and
 *   - merged-PR attribution needs a date window, so undated cycles always
 *     show 0 PRs.
 *
 * This script infers windows for undated cycles named "Cycle N" by
 * extrapolating BACKWARDS from the earliest dated cycle at a fixed cadence
 * (default 14 days). Only cycles numbered BELOW the earliest dated cycle are
 * touched — an undated future cycle's dates aren't ours to guess. Unnumbered
 * cycles (e.g. "KANBAN") are reported and left alone.
 *
 * Dry run (default, read-only):
 *   npx tsx scripts/backfill-cycle-dates.ts --workspace clear
 * Apply:
 *   npx tsx scripts/backfill-cycle-dates.ts --workspace clear --apply
 * Options:
 *   --cadence-days <n>   days between cycle starts (default 14)
 */

// Load environment variables (default import — named import breaks under ESM
// tsx). The db import below must stay DYNAMIC: a static import is hoisted
// above loadEnvConfig and env validation fires before anything is loaded.
import nextEnv from '@next/env';
nextEnv.loadEnvConfig(process.cwd());

const { db } = await import('../src/server/db');

const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] ?? null) : null;
}

const WORKSPACE_SLUG = argValue('--workspace');
const CADENCE_DAYS = Number(argValue('--cadence-days') ?? '14');
const DAY_MS = 24 * 60 * 60 * 1000;

/** "Cycle 7" / "cycle 07" -> 7; null when the name carries no number. */
function cycleNumber(name: string): number | null {
  const match = /(\d+)\s*$/.exec(name.trim());
  return match?.[1] ? Number(match[1]) : null;
}

async function main() {
  if (!WORKSPACE_SLUG) {
    console.error('Usage: npx tsx scripts/backfill-cycle-dates.ts --workspace <slug> [--apply] [--cadence-days 14]');
    process.exit(1);
  }
  if (!Number.isFinite(CADENCE_DAYS) || CADENCE_DAYS <= 0) {
    console.error(`Invalid --cadence-days: ${String(CADENCE_DAYS)}`);
    process.exit(1);
  }

  const workspace = await db.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
    select: { id: true, name: true },
  });
  if (!workspace) {
    console.error(`Workspace "${WORKSPACE_SLUG}" not found`);
    process.exit(1);
  }

  const cycles = await db.list.findMany({
    where: { workspaceId: workspace.id, listType: 'SPRINT' },
    select: { id: true, name: true, startDate: true, endDate: true },
    orderBy: { createdAt: 'asc' },
  });

  const dated = cycles.filter((c) => c.startDate);
  const undated = cycles.filter((c) => !c.startDate);

  console.log(`Workspace: ${workspace.name} (${WORKSPACE_SLUG})`);
  console.log(`Cycles: ${cycles.length} total, ${dated.length} dated, ${undated.length} undated\n`);

  if (undated.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  // Anchor: the dated cycle with the LOWEST number. Everything below it gets
  // a window extrapolated backwards at the cadence.
  const numberedDated = dated
    .map((c) => ({ ...c, num: cycleNumber(c.name) }))
    .filter((c): c is typeof c & { num: number } => c.num != null)
    .sort((a, b) => a.num - b.num);
  const anchor = numberedDated[0];

  if (!anchor) {
    console.error('No dated cycle with a numeric name to anchor on — cannot infer anything.');
    process.exit(1);
  }
  console.log(
    `Anchor: "${anchor.name}" starts ${anchor.startDate!.toISOString()} — extrapolating backwards at ${CADENCE_DAYS}-day cadence\n`,
  );

  const plan: Array<{ id: string; name: string; start: Date; end: Date }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];

  for (const cycle of undated) {
    const num = cycleNumber(cycle.name);
    if (num == null) {
      skipped.push({ name: cycle.name, reason: 'no cycle number in name' });
      continue;
    }
    if (num >= anchor.num) {
      skipped.push({ name: cycle.name, reason: `number >= anchor (${anchor.name}) — future/unknown, not guessing` });
      continue;
    }
    const start = new Date(anchor.startDate!.getTime() - (anchor.num - num) * CADENCE_DAYS * DAY_MS);
    // End the day before the next cycle starts so windows don't overlap.
    const end = new Date(start.getTime() + CADENCE_DAYS * DAY_MS - DAY_MS);
    plan.push({ id: cycle.id, name: cycle.name, start, end });
  }

  plan.sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const p of plan) {
    console.log(`  ${p.name.padEnd(12)} ${p.start.toISOString().slice(0, 10)} -> ${p.end.toISOString().slice(0, 10)}`);
  }
  for (const s of skipped) {
    console.log(`  SKIP ${s.name.padEnd(12)} (${s.reason})`);
  }

  if (!APPLY) {
    console.log(`\nDry run — no writes. Re-run with --apply to set dates on ${plan.length} cycles.`);
    return;
  }

  for (const p of plan) {
    await db.list.update({
      where: { id: p.id },
      data: { startDate: p.start, endDate: p.end },
    });
    console.log(`Updated ${p.name}`);
  }
  console.log(`\nDone — ${plan.length} cycles dated.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
