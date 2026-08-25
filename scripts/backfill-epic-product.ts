#!/usr/bin/env ts-node

/**
 * Backfill Epic.productId
 *
 * Epics used to be workspace-scoped and are now per-product. This assigns each
 * existing epic to a product by majority vote of its tickets:
 *
 *   - all tickets in one product      -> assign that product (clean)
 *   - tickets across several products -> assign the majority product and
 *                                        REPORT the minority tickets, which
 *                                        will lose their epic link when the
 *                                        product-containment guard tightens
 *   - no tickets at all               -> left null, needs a human decision
 *
 * The minority case is why this is not a blind UPDATE: at time of writing
 * "Closed-loop Ticket lifecycle" spans agent-skills (6 tickets) and
 * exponential (2), and which side keeps the epic is a product call.
 *
 * Dry run (default, read-only):   bun scripts/backfill-epic-product.ts
 * Apply:                          bun scripts/backfill-epic-product.ts --apply
 */

// Load environment variables
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db } from '../src/server/db';

const APPLY = process.argv.includes('--apply');

interface Plan {
  epicId: string;
  epicName: string;
  workspaceSlug: string;
  chosenProductId: string | null;
  chosenProductSlug: string | null;
  distribution: Array<{ productSlug: string; count: number }>;
  orphanedTicketCount: number;
  note: string;
}

async function buildPlan(): Promise<Plan[]> {
  const epics = await db.epic.findMany({
    where: { productId: null },
    select: {
      id: true,
      name: true,
      workspace: { select: { slug: true } },
      tickets: {
        select: { product: { select: { id: true, slug: true } } },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return epics.map((epic) => {
    const counts = new Map<string, { slug: string; count: number }>();
    for (const ticket of epic.tickets) {
      const entry = counts.get(ticket.product.id) ?? {
        slug: ticket.product.slug,
        count: 0,
      };
      entry.count += 1;
      counts.set(ticket.product.id, entry);
    }

    const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
    const winner = ranked[0];
    const total = epic.tickets.length;
    const majority = winner?.[1].count ?? 0;

    return {
      epicId: epic.id,
      epicName: epic.name,
      workspaceSlug: epic.workspace.slug,
      chosenProductId: winner?.[0] ?? null,
      chosenProductSlug: winner?.[1].slug ?? null,
      distribution: ranked.map(([, v]) => ({ productSlug: v.slug, count: v.count })),
      orphanedTicketCount: total - majority,
      note:
        total === 0
          ? 'NO TICKETS — assign by hand in the UI'
          : ranked.length > 1
            ? `SPLIT across ${ranked.length} products — ${total - majority} ticket(s) will lose this epic`
            : 'clean',
    };
  });
}

async function main() {
  const plan = await buildPlan();

  if (plan.length === 0) {
    console.log('No epics with a null productId. Nothing to do.');
    return;
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${plan.length} epic(s) without a product\n`);

  for (const row of plan) {
    const dist = row.distribution
      .map((d) => `${d.productSlug}:${d.count}`)
      .join(', ');
    console.log(`  [${row.workspaceSlug}] ${row.epicName}`);
    console.log(`      tickets   : ${dist || '(none)'}`);
    console.log(`      -> product: ${row.chosenProductSlug ?? '(unassigned)'}`);
    console.log(`      note      : ${row.note}\n`);
  }

  const splits = plan.filter((p) => p.orphanedTicketCount > 0);
  const unassigned = plan.filter((p) => p.chosenProductId === null);

  console.log('Summary');
  console.log(`  assignable      : ${plan.length - unassigned.length}`);
  console.log(`  needs a human   : ${unassigned.length}`);
  console.log(`  cross-product   : ${splits.length}`);
  console.log(
    `  tickets losing their epic if applied as-is: ${splits.reduce((n, p) => n + p.orphanedTicketCount, 0)}`,
  );

  if (!APPLY) {
    console.log('\nRe-run with --apply to write these assignments.');
    return;
  }

  let written = 0;
  for (const row of plan) {
    if (!row.chosenProductId) continue;
    await db.epic.update({
      where: { id: row.epicId },
      data: { productId: row.chosenProductId },
    });
    written += 1;
  }
  console.log(`\nAssigned ${written} epic(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
