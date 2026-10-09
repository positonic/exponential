#!/usr/bin/env ts-node

/**
 * Re-derive PageLink rows from stored bodyDoc
 *
 * The `20261008120000_add_page_link` migration backfills `PageLink` from one
 * snapshot of `KnowledgePage`. Production migrations run from a GitHub Action
 * while Vercel is still building, so for a few minutes the previous app
 * version keeps saving pages without touching `PageLink`. A link added or
 * removed in that window would sit missing/stale in the Pages tree and
 * breadcrumbs until the page is next saved. Run this once after the deploy is
 * live to catch those pages up.
 *
 * It re-runs `syncPageLinks` (the same code every body write uses) for each
 * page edited since `--since`, so it is idempotent and safe to repeat.
 *
 * Dry run (default, read-only):  bun scripts/resync-page-links.ts --since 2026-10-08T12:00:00Z
 * Apply:                         bun scripts/resync-page-links.ts --since 2026-10-08T12:00:00Z --apply
 *
 * `--since` defaults to 24 hours ago; `--since all` covers every page.
 */

// Load environment variables
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import type { JSONContent } from '@tiptap/core';
import { db } from '../src/server/db';
import { syncPageLinks } from '../src/server/services/pages/page-links';

const APPLY = process.argv.includes('--apply');

function parseSince(): Date | null {
  const i = process.argv.indexOf('--since');
  const raw = i >= 0 ? process.argv[i + 1] : undefined;
  if (raw === 'all') return null;
  if (!raw) return new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since = new Date(raw);
  if (Number.isNaN(since.getTime())) {
    throw new Error(`--since must be an ISO timestamp or "all", got "${raw}"`);
  }
  return since;
}

async function main() {
  const since = parseSince();
  const pages = await db.knowledgePage.findMany({
    where: since ? { updatedAt: { gte: since } } : {},
    select: { id: true },
    orderBy: { updatedAt: 'asc' },
  });
  console.log(
    `${pages.length} page(s) edited ${since ? `since ${since.toISOString()}` : 'ever'}.`,
  );

  let changed = 0;
  for (const { id } of pages) {
    // Each page in its own transaction: read the doc, rewrite its rows, and
    // compare. A dry run rolls the rewrite back.
    try {
      await db.$transaction(async (tx) => {
        const before = await tx.pageLink.findMany({
          where: { fromPageId: id },
          orderBy: { position: 'asc' },
          select: { toPageId: true, position: true },
        });
        const page = await tx.knowledgePage.findUniqueOrThrow({
          where: { id },
          select: { bodyDoc: true },
        });
        await syncPageLinks(tx, id, page.bodyDoc as JSONContent | null);
        const after = await tx.pageLink.findMany({
          where: { fromPageId: id },
          orderBy: { position: 'asc' },
          select: { toPageId: true, position: true },
        });
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          changed++;
          console.log(
            `  ${id}: [${before.map((l) => l.toPageId).join(', ')}] -> [${after.map((l) => l.toPageId).join(', ')}]`,
          );
        }
        if (!APPLY) throw new DryRunRollback();
      });
    } catch (error) {
      if (!(error instanceof DryRunRollback)) throw error;
    }
  }

  console.log(
    APPLY
      ? `Resynced ${pages.length} page(s); ${changed} had stale links.`
      : `Dry run: ${changed} page(s) have stale links. Re-run with --apply to fix.`,
  );
}

class DryRunRollback extends Error {}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void db.$disconnect());
