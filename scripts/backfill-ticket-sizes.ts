#!/usr/bin/env ts-node

/**
 * Backfill sizes on completed tickets by classification (ticket dusty.cloud).
 *
 * The size-versus-actual view needs sizes on historical tickets, and nobody
 * will hand-size hundreds of done tickets. They can be classified: the body
 * says what was asked, the linked PR says what it took, and the event log
 * says how long. This script asks the model (same prompt module as the
 * create-form suggestion) for a size and a confidence per ticket, in batches,
 * and WRITES only the confident ones; everything else lands in a report for a
 * human to review.
 *
 * Only DONE/DEPLOYED tickets with `points == null` are considered, so a
 * ticket sized by a person (or by an earlier run) is never touched. Tickets
 * with no body and no PR are reported as unsizeable and skipped.
 *
 * Dry run (default, read-only — still calls the model):
 *   npx tsx scripts/backfill-ticket-sizes.ts --product <cuid>
 * Apply:
 *   npx tsx scripts/backfill-ticket-sizes.ts --product <cuid> --apply
 * Options:
 *   --min-confidence <0..1>  write threshold (default 0.7)
 *   --limit <n>              classify at most n tickets (trial runs)
 *   --report <path>          write every proposal as JSON for review
 *   GITHUB_TOKEN             optional; when set, linked PRs contribute
 *                            additions/deletions/changed files
 */

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { parsePrUrl } from '../src/plugins/product/server/managerOverview';
import {
  classifyTicketSizes,
  defaultSizeOpenAI,
  loadSizeAnchors,
  sizeToPoints,
  type BatchSizeItem,
  type BatchSizeResult,
} from '../src/plugins/product/server/sizeSuggestion';
import {
  HOUR,
  cycleTimesMs,
  finishedAtFromEvents,
  startedAtFromEvents,
  statusMovesFromEvents,
} from '../src/server/services/deliveryFlow';
import type { EffortUnit } from '../src/types/effort';

const BATCH_SIZE = 20;
const MAX_BODY_CHARS = 2000;

export interface PrStats {
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface CandidateTicket {
  id: string;
  title: string;
  body: string | null;
  prUrl: string | null;
  links: unknown;
}

/**
 * What the model sees for one ticket, or null when there is nothing to size
 * from (no body and no PR). Pure.
 */
export function buildClassificationInput(
  ticket: CandidateTicket,
  pr: PrStats | null,
  cycleTimeHours: number | null,
): BatchSizeItem | null {
  const body = (ticket.body ?? '').trim();
  if (!body && !pr) return null;
  return {
    id: ticket.id,
    title: ticket.title,
    body: body.length > MAX_BODY_CHARS ? `${body.slice(0, MAX_BODY_CHARS)}…` : body,
    pr,
    cycleTimeHours,
  };
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Merge the provenance marker into whatever links the ticket already has. */
export function withSizeSource(links: unknown, source: string): Record<string, string> {
  const existing =
    links && typeof links === 'object' && !Array.isArray(links)
      ? (links as Record<string, string>)
      : {};
  return { ...existing, sizeSource: source };
}

async function fetchPrStats(prUrl: string, token: string): Promise<PrStats | null> {
  const ref = parsePrUrl(prUrl);
  if (!ref) return null;
  const res = await fetch(`https://api.github.com/repos/${ref.repo}/pulls/${ref.number}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) return null;
  const pr = (await res.json()) as { additions?: number; deletions?: number; changed_files?: number };
  if (pr.additions == null || pr.deletions == null || pr.changed_files == null) return null;
  return { additions: pr.additions, deletions: pr.deletions, changedFiles: pr.changed_files };
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  const nextEnv = (await import('@next/env')).default;
  nextEnv.loadEnvConfig(process.cwd());
  const { db } = await import('../src/server/db');

  const APPLY = process.argv.includes('--apply');
  const PRODUCT_ID = argValue('--product');
  const MIN_CONFIDENCE = Number(argValue('--min-confidence') ?? '0.7');
  const LIMIT = argValue('--limit') ? Number(argValue('--limit')) : null;
  const REPORT = argValue('--report');
  const TOKEN = process.env.GITHUB_TOKEN ?? null;

  if (!PRODUCT_ID) {
    console.error(
      'Usage: npx tsx scripts/backfill-ticket-sizes.ts --product <cuid> [--apply] [--min-confidence 0.7] [--limit n] [--report out.json]',
    );
    process.exit(1);
  }
  const openai = defaultSizeOpenAI();
  if (!openai) {
    console.error('OPENAI_API_KEY is not set; nothing to classify with.');
    process.exit(1);
  }

  const product = await db.product.findUnique({
    where: { id: PRODUCT_ID },
    select: { id: true, name: true, workspaceId: true, workspace: { select: { effortUnit: true } } },
  });
  if (!product) {
    console.error(`Product "${PRODUCT_ID}" not found`);
    process.exit(1);
  }
  const unit: EffortUnit = product.workspace.effortUnit;
  // Writes are attributed to the product's first owner/admin we can find, for
  // the AI interaction log only; nothing else is written in their name.
  const member = await db.workspaceUser.findFirst({
    where: { workspaceId: product.workspaceId, role: { in: ['owner', 'admin'] } },
    select: { userId: true },
  });
  const userId = member?.userId ?? 'system';

  const candidates = await db.ticket.findMany({
    where: { productId: product.id, status: { in: ['DONE', 'DEPLOYED'] }, points: null },
    orderBy: { completedAt: 'desc' },
    ...(LIMIT ? { take: LIMIT } : {}),
    select: { id: true, title: true, body: true, prUrl: true, links: true },
  });
  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'} — ${product.name}: ${candidates.length} completed, unsized ticket(s); unit ${unit}; PR stats ${TOKEN ? 'on' : 'off (no GITHUB_TOKEN)'}\n`,
  );
  if (candidates.length === 0) return;

  const events = await db.workspaceActivityEvent.findMany({
    where: {
      workspaceId: product.workspaceId,
      entityType: 'ticket',
      entityId: { in: candidates.map((t) => t.id) },
      action: 'status_changed',
    },
    orderBy: { createdAt: 'asc' },
    select: { entityId: true, metadata: true, createdAt: true },
  });
  const moves = statusMovesFromEvents(events);
  const finished = finishedAtFromEvents(moves);
  const started = startedAtFromEvents(moves);
  const cycleHours = new Map<string, number>();
  for (const t of candidates) {
    const [ms] = cycleTimesMs([{ id: t.id, finishedAt: finished.get(t.id) ?? null }], started);
    if (ms != null) cycleHours.set(t.id, ms / HOUR);
  }

  const items: BatchSizeItem[] = [];
  const unsizeable: string[] = [];
  for (const t of candidates) {
    const pr = TOKEN && t.prUrl ? await fetchPrStats(t.prUrl, TOKEN) : null;
    const item = buildClassificationInput(t, pr, cycleHours.get(t.id) ?? null);
    if (item) items.push(item);
    else unsizeable.push(t.id);
  }

  const anchors = await loadSizeAnchors(db, product, unit);
  const proposals: (BatchSizeResult & { title: string; points: number })[] = [];
  const byId = new Map(candidates.map((t) => [t.id, t]));
  for (const batch of chunk(items, BATCH_SIZE)) {
    try {
      const results = await classifyTicketSizes(db, { product, userId, items: batch, anchors, openai });
      for (const r of results) {
        const t = byId.get(r.id);
        if (!t) continue;
        proposals.push({ ...r, title: t.title, points: sizeToPoints(r.size, unit) });
      }
    } catch (err) {
      console.error(`  batch failed (${batch.length} tickets): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const confident = proposals.filter((p) => p.confidence >= MIN_CONFIDENCE);
  const unsure = proposals.filter((p) => p.confidence < MIN_CONFIDENCE);
  const dist: Record<string, number> = {};
  for (const p of confident) dist[p.size] = (dist[p.size] ?? 0) + 1;

  console.log(`Sized ${proposals.length} / ${items.length} classified; ${unsizeable.length} unsizeable (no body, no PR).`);
  console.log(`Confident (>= ${MIN_CONFIDENCE}): ${confident.length} — ${JSON.stringify(dist)}; for review: ${unsure.length}\n`);
  for (const p of [...confident, ...unsure].slice(0, 40)) {
    console.log(`  ${p.size.padEnd(2)} ${p.confidence.toFixed(2)}  ${p.title.slice(0, 60)}  — ${p.rationale}`);
  }
  if (proposals.length > 40) console.log(`  … ${proposals.length - 40} more (see --report)`);

  if (REPORT) {
    await writeFile(
      REPORT,
      JSON.stringify({ productId: product.id, unit, minConfidence: MIN_CONFIDENCE, proposals, unsizeable }, null, 2),
    );
    console.log(`\nReport written to ${REPORT}`);
  }

  if (!APPLY) {
    console.log('\nRe-run with --apply to write the confident sizes.');
    await db.$disconnect();
    return;
  }

  const updates = confident.map((p) =>
    db.ticket.update({
      where: { id: p.id },
      data: { points: p.points, links: withSizeSource(byId.get(p.id)?.links, 'ai-backfill') },
    }),
  );
  for (let i = 0; i < updates.length; i += 50) {
    await db.$transaction(updates.slice(i, i + 50));
  }
  console.log(`\nApplied ${updates.length} size(s).`);
  await db.$disconnect();
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
