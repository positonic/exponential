#!/usr/bin/env npx tsx
/**
 * OKR CLI - Command line interface for viewing OKRs
 *
 * Usage:
 *   npx tsx scripts/okr-cli.ts list [--workspace <slug>] [--period <period>]
 *   npx tsx scripts/okr-cli.ts stats [--workspace <slug>] [--period <period>]
 *   npx tsx scripts/okr-cli.ts workspaces
 *
 * Examples:
 *   npx tsx scripts/okr-cli.ts list --workspace ftc --period Q1-2026
 *   npx tsx scripts/okr-cli.ts stats --workspace ftc
 *   npx tsx scripts/okr-cli.ts workspaces
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface KeyResult {
  id: string;
  title: string;
  targetValue: number;
  currentValue: number;
  startValue: number;
  unit: string;
  unitLabel: string | null;
  period: string;
  status: string;
  confidence: number | null;
}

interface Goal {
  id: number;
  title: string;
  description: string | null;
  period: string | null;
  keyResults: KeyResult[];
  lifeDomain: { title: string } | null;
}

function calculateProgress(kr: KeyResult): number {
  const range = kr.targetValue - kr.startValue;
  if (range <= 0) return 0;
  const progress = ((kr.currentValue - kr.startValue) / range) * 100;
  return Math.min(100, Math.max(0, progress));
}

function formatValue(kr: KeyResult, value: number): string {
  switch (kr.unit) {
    case "percent":
      return `${value}%`;
    case "currency":
      return kr.unitLabel ? `${kr.unitLabel}${value}` : `$${value}`;
    case "hours":
      return `${value}h`;
    case "count":
      return kr.unitLabel ? `${value} ${kr.unitLabel}` : `${value}`;
    case "custom":
      return kr.unitLabel ? `${value} ${kr.unitLabel}` : `${value}`;
    default:
      return `${value}`;
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case "achieved":
      return "✅";
    case "on-track":
      return "🟢";
    case "at-risk":
      return "🟡";
    case "off-track":
      return "🔴";
    default:
      return "⚪";
  }
}

function progressBar(progress: number, width: number = 20): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return `[${"█".repeat(filled)}${"░".repeat(empty)}]`;
}

async function getWorkspaceId(slug?: string): Promise<string | undefined> {
  if (!slug) return undefined;

  const workspace = await prisma.workspace.findUnique({
    where: { slug },
    select: { id: true },
  });

  if (!workspace) {
    console.error(`Workspace not found: ${slug}`);
    process.exit(1);
  }

  return workspace.id;
}

async function listWorkspaces() {
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      _count: {
        select: {
          goals: true,
          keyResults: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  console.log("\n📁 Workspaces\n");
  console.log(
    "┌──────────────────────┬──────────────────────┬──────────┬───────┬────────┐"
  );
  console.log(
    "│ Name                 │ Slug                 │ Type     │ Goals │ KRs    │"
  );
  console.log(
    "├──────────────────────┼──────────────────────┼──────────┼───────┼────────┤"
  );

  for (const ws of workspaces) {
    const name = ws.name.padEnd(20).slice(0, 20);
    const slug = ws.slug.padEnd(20).slice(0, 20);
    const type = ws.type.padEnd(8).slice(0, 8);
    const goals = String(ws._count.goals).padStart(5);
    const krs = String(ws._count.keyResults).padStart(6);
    console.log(`│ ${name} │ ${slug} │ ${type} │ ${goals} │ ${krs} │`);
  }

  console.log(
    "└──────────────────────┴──────────────────────┴──────────┴───────┴────────┘"
  );
  console.log();
}

async function listOKRs(workspaceSlug?: string, period?: string) {
  const workspaceId = await getWorkspaceId(workspaceSlug);

  const goals = (await prisma.goal.findMany({
    where: {
      ...(workspaceId ? { workspaceId } : {}),
    },
    include: {
      keyResults: {
        where: period ? { period } : {},
        orderBy: { createdAt: "asc" },
      },
      lifeDomain: { select: { title: true } },
      workspace: { select: { name: true, slug: true } },
    },
    orderBy: { title: "asc" },
  })) as (Goal & { workspace: { name: string; slug: string } | null })[];

  // Filter to only goals that have key results (after period filter)
  const goalsWithKRs = goals.filter((g) => g.keyResults.length > 0);

  if (goalsWithKRs.length === 0) {
    console.log("\n📊 No OKRs found");
    if (period) console.log(`   Period filter: ${period}`);
    if (workspaceSlug) console.log(`   Workspace: ${workspaceSlug}`);
    console.log();
    return;
  }

  console.log("\n📊 OKRs (Objectives & Key Results)\n");

  if (period) console.log(`📅 Period: ${period}`);
  if (workspaceSlug) console.log(`📁 Workspace: ${workspaceSlug}`);
  console.log("─".repeat(70));

  for (const goal of goalsWithKRs) {
    // Calculate objective progress
    const avgProgress =
      goal.keyResults.reduce((acc, kr) => acc + calculateProgress(kr), 0) /
      goal.keyResults.length;

    console.log();
    console.log(
      `🎯 ${goal.title} ${progressBar(avgProgress, 15)} ${Math.round(avgProgress)}%`
    );
    if (goal.lifeDomain) {
      console.log(`   Domain: ${goal.lifeDomain.title}`);
    }
    if (goal.workspace && !workspaceSlug) {
      console.log(`   Workspace: ${goal.workspace.name}`);
    }
    console.log();

    for (const kr of goal.keyResults) {
      const progress = calculateProgress(kr);
      const emoji = getStatusEmoji(kr.status);
      const current = formatValue(kr, kr.currentValue);
      const target = formatValue(kr, kr.targetValue);

      console.log(`   ${emoji} ${kr.title}`);
      console.log(
        `      ${progressBar(progress)} ${Math.round(progress)}% (${current} / ${target})`
      );
      console.log(`      Period: ${kr.period} | Status: ${kr.status}`);
      if (kr.confidence !== null) {
        console.log(`      Confidence: ${kr.confidence}%`);
      }
      console.log();
    }
  }

  console.log("─".repeat(70));
  console.log(
    `Total: ${goalsWithKRs.length} objectives, ${goalsWithKRs.reduce((acc, g) => acc + g.keyResults.length, 0)} key results\n`
  );
}

async function showStats(workspaceSlug?: string, period?: string) {
  const workspaceId = await getWorkspaceId(workspaceSlug);

  const where = {
    ...(workspaceId ? { workspaceId } : {}),
    ...(period ? { period } : {}),
  };

  const [total, onTrack, atRisk, offTrack, achieved, keyResults] =
    await Promise.all([
      prisma.keyResult.count({ where }),
      prisma.keyResult.count({ where: { ...where, status: "on-track" } }),
      prisma.keyResult.count({ where: { ...where, status: "at-risk" } }),
      prisma.keyResult.count({ where: { ...where, status: "off-track" } }),
      prisma.keyResult.count({ where: { ...where, status: "achieved" } }),
      prisma.keyResult.findMany({
        where,
        select: {
          currentValue: true,
          startValue: true,
          targetValue: true,
          confidence: true,
        },
      }),
    ]);

  const avgProgress =
    keyResults.length > 0
      ? keyResults.reduce((acc, kr) => {
          const range = kr.targetValue - kr.startValue;
          const progress =
            range > 0
              ? ((kr.currentValue - kr.startValue) / range) * 100
              : 0;
          return acc + Math.min(100, Math.max(0, progress));
        }, 0) / keyResults.length
      : 0;

  const krsWithConfidence = keyResults.filter((kr) => kr.confidence !== null);
  const avgConfidence =
    krsWithConfidence.length > 0
      ? krsWithConfidence.reduce((acc, kr) => acc + (kr.confidence ?? 0), 0) /
        krsWithConfidence.length
      : null;

  console.log("\n📈 OKR Statistics\n");

  if (period) console.log(`📅 Period: ${period}`);
  if (workspaceSlug) console.log(`📁 Workspace: ${workspaceSlug}`);
  console.log("─".repeat(50));
  console.log();

  console.log(`📊 Key Results: ${total}`);
  console.log(`   ✅ Achieved:  ${achieved}`);
  console.log(`   🟢 On Track:  ${onTrack}`);
  console.log(`   🟡 At Risk:   ${atRisk}`);
  console.log(`   🔴 Off Track: ${offTrack}`);
  console.log();
  console.log(
    `📈 Average Progress: ${progressBar(avgProgress)} ${Math.round(avgProgress)}%`
  );
  if (avgConfidence !== null) {
    console.log(`🎯 Average Confidence: ${Math.round(avgConfidence)}%`);
  }
  console.log();
  console.log("─".repeat(50));
  console.log();
}

function printHelp() {
  console.log(`
OKR CLI - Command line interface for viewing OKRs

Usage:
  npx tsx scripts/okr-cli.ts <command> [options]

Commands:
  list        List all OKRs (objectives and key results)
  stats       Show OKR statistics summary
  workspaces  List all workspaces

Options:
  --workspace, -w <slug>   Filter by workspace slug
  --period, -p <period>    Filter by period (e.g., Q1-2026, Annual-2026)
  --help, -h               Show this help message

Examples:
  npx tsx scripts/okr-cli.ts workspaces
  npx tsx scripts/okr-cli.ts list --workspace ftc --period Q1-2026
  npx tsx scripts/okr-cli.ts stats --workspace ftc
`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // Parse options
  let workspaceSlug: string | undefined;
  let period: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--workspace" || arg === "-w") {
      workspaceSlug = args[++i];
    } else if (arg === "--period" || arg === "-p") {
      period = args[++i];
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      return;
    }
  }

  try {
    switch (command) {
      case "list":
        await listOKRs(workspaceSlug, period);
        break;
      case "stats":
        await showStats(workspaceSlug, period);
        break;
      case "workspaces":
        await listWorkspaces();
        break;
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        break;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
