#!/usr/bin/env ts-node

/**
 * Backfill `Ticket.completedAt` from the activity event log.
 *
 * Until the "first finished at" guard landed in the ticket router (ticket
 * prime.swan, ticket 689), every save that carried a completed status re-stamped
 * `completedAt`, so the column recorded "last edited at": 149 tickets in one
 * product were "completed" on a single day by a bulk write. The reliable
 * record is `WorkspaceActivityEvent` (entityType "ticket", action
 * "status_changed", metadata.to), which the product Overview already reads
 * through `finishedAtFromEvents`. This script applies the same rule to the
 * stored column:
 *
 *   - a ticket in DONE/DEPLOYED gets the time of its FIRST move into a
 *     completed status after its LAST reopen;
 *   - a ticket in DONE/DEPLOYED with NO status event (created straight into
 *     DONE, or older than the event log) is left alone and reported — we do
 *     not guess from createdAt;
 *   - a ticket NOT in a completed status gets `completedAt = null`.
 *
 * Idempotent: a second run changes nothing. Run the router fix first, or the
 * next sync undoes this.
 *
 * Dry run (default, read-only):
 *   npx tsx scripts/backfill-ticket-completed-at.ts --product <cuid>
 *   npx tsx scripts/backfill-ticket-completed-at.ts --all
 * Apply:
 *   npx tsx scripts/backfill-ticket-completed-at.ts --product <cuid> --apply
 */

import path from 'node:path';
import { finishedAtFromEvents } from '../src/plugins/product/server/managerOverview';

const COMPLETED: ReadonlySet<string> = new Set(['DONE', 'DEPLOYED']);

export interface TicketRow {
  id: string;
  status: string;
  completedAt: Date | null;
}

export interface StatusMove {
  ticketId: string;
  to: string;
  at: Date;
}

export type Decision =
  | { kind: 'set'; completedAt: Date }
  | { kind: 'clear' }
  | { kind: 'unchanged' }
  | { kind: 'no-event' };

/**
 * What to do with one ticket, given every status move in the product (oldest
 * first). Pure, so the rule is unit-testable without a database.
 */
export function decideCompletedAt(
  ticket: TicketRow,
  finishedAt: ReadonlyMap<string, Date>,
): Decision {
  if (!COMPLETED.has(ticket.status)) {
    return ticket.completedAt === null ? { kind: 'unchanged' } : { kind: 'clear' };
  }
  const finished = finishedAt.get(ticket.id);
  if (!finished) return { kind: 'no-event' };
  if (ticket.completedAt && ticket.completedAt.getTime() === finished.getTime()) {
    return { kind: 'unchanged' };
  }
  return { kind: 'set', completedAt: finished };
}

export function planBackfill(
  tickets: TicketRow[],
  moves: StatusMove[],
): Map<string, Decision> {
  const finishedAt = finishedAtFromEvents(moves);
  return new Map(tickets.map((t) => [t.id, decideCompletedAt(t, finishedAt)]));
}

/** Completed tickets per month, for the before/after sanity print. */
export function monthlyHistogram(dates: (Date | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dates) {
    if (!d) continue;
    const key = d.toISOString().slice(0, 7);
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? (process.argv[i + 1] ?? null) : null;
}

async function main() {
  // Load environment variables (default import — named import breaks under
  // ESM tsx). The db import must stay DYNAMIC: a static import is hoisted
  // above loadEnvConfig and env validation fires before anything is loaded.
  const nextEnv = (await import('@next/env')).default;
  nextEnv.loadEnvConfig(process.cwd());
  const { db } = await import('../src/server/db');

  const APPLY = process.argv.includes('--apply');
  const ALL = process.argv.includes('--all');
  const PRODUCT_ID = argValue('--product');

  if (!ALL && !PRODUCT_ID) {
    console.error(
      'Usage: npx tsx scripts/backfill-ticket-completed-at.ts (--product <cuid> | --all) [--apply]',
    );
    process.exit(1);
  }

  const products = await db.product.findMany({
    where: ALL ? {} : { id: PRODUCT_ID! },
    select: { id: true, name: true, workspaceId: true },
    orderBy: { name: 'asc' },
  });
  if (products.length === 0) {
    console.error(PRODUCT_ID ? `Product "${PRODUCT_ID}" not found` : 'No products found');
    process.exit(1);
  }

  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${products.length} product(s)\n`);

  let totalSet = 0;
  let totalClear = 0;
  let totalNoEvent = 0;

  for (const product of products) {
    const tickets = await db.ticket.findMany({
      where: { productId: product.id },
      select: { id: true, status: true, completedAt: true },
    });
    if (tickets.length === 0) continue;

    const events = await db.workspaceActivityEvent.findMany({
      where: {
        workspaceId: product.workspaceId,
        entityType: 'ticket',
        entityId: { in: tickets.map((t) => t.id) },
        action: 'status_changed',
      },
      orderBy: { createdAt: 'asc' },
      select: { entityId: true, metadata: true, createdAt: true },
    });
    const moves: StatusMove[] = [];
    for (const e of events) {
      const to = (e.metadata as { to?: unknown } | null)?.to;
      if (typeof to === 'string') moves.push({ ticketId: e.entityId, to, at: e.createdAt });
    }

    const plan = planBackfill(tickets, moves);
    const counts = { set: 0, clear: 0, unchanged: 0, 'no-event': 0 };
    for (const d of plan.values()) counts[d.kind] += 1;

    const completedNow = tickets.filter((t) => COMPLETED.has(t.status));
    const before = monthlyHistogram(completedNow.map((t) => t.completedAt));
    const after = monthlyHistogram(
      completedNow.map((t) => {
        const d = plan.get(t.id);
        return d?.kind === 'set' ? d.completedAt : d?.kind === 'no-event' ? t.completedAt : t.completedAt;
      }),
    );

    console.log(`${product.name} (${product.id})`);
    console.log(
      `  tickets ${tickets.length} · set ${counts.set} · clear ${counts.clear} · unchanged ${counts.unchanged} · no-event ${counts['no-event']}`,
    );
    console.log(`  completed/month before: ${JSON.stringify(before)}`);
    console.log(`  completed/month after:  ${JSON.stringify(after)}`);

    totalSet += counts.set;
    totalClear += counts.clear;
    totalNoEvent += counts['no-event'];

    if (!APPLY) continue;

    const updates = [...plan.entries()].flatMap(([id, d]) =>
      d.kind === 'set'
        ? [db.ticket.update({ where: { id }, data: { completedAt: d.completedAt } })]
        : d.kind === 'clear'
          ? [db.ticket.update({ where: { id }, data: { completedAt: null } })]
          : [],
    );
    // Chunked so a big product doesn't open one giant transaction.
    for (let i = 0; i < updates.length; i += 100) {
      await db.$transaction(updates.slice(i, i + 100));
    }
    console.log(`  applied ${updates.length} update(s)`);
  }

  console.log(
    `\n${APPLY ? 'Applied' : 'Would apply'}: set ${totalSet}, clear ${totalClear}; left alone (no event) ${totalNoEvent}`,
  );
  if (!APPLY) console.log('Re-run with --apply to write.');
  await db.$disconnect();
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
