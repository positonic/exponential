/**
 * ticketDependencies — shared helpers for the ticket dependency graph.
 *
 * Lives in the services layer (ADR-0016 pattern, like createTicket.ts) so both
 * the product plugin's `ticket` router and the agent-facing `mastra` router
 * enforce the same safety rules (no self-deps, no cycles) through one code path.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

/**
 * BFS from `startId` following depsOut edges. Returns true if `targetId` is
 * transitively reachable. Used to prevent cycles when adding a dependency.
 */
export async function wouldCreateCycle(
  db: PrismaClient | Prisma.TransactionClient,
  startId: string,
  targetId: string,
): Promise<boolean> {
  if (startId === targetId) return true;
  const visited = new Set<string>();
  const queue: string[] = [startId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const edges = await db.ticketDependency.findMany({
      where: { ticketId: current },
      select: { dependsOnId: true },
    });
    for (const e of edges) {
      if (e.dependsOnId === targetId) return true;
      if (!visited.has(e.dependsOnId)) queue.push(e.dependsOnId);
    }
  }
  return false;
}

/** Minimal cycle shape needed for name matching. */
export interface MatchableCycle {
  id: string;
  name: string;
  slug: string;
}

/**
 * Resolve a human cycle reference to a cycle row. Agents and users say
 * "cycle 10", "Cycle 10", "cycle-10", or just "10"; cycles are stored as
 * workspace Lists named "Cycle N" with slugs like "cycle-10". Matches, in
 * order: exact id, exact slug, case-insensitive name, then bare number
 * against a trailing number in the name (so "10" finds "Cycle 10").
 */
export function matchCycle(
  cycles: MatchableCycle[],
  query: string,
): MatchableCycle | undefined {
  const q = query.trim();
  if (!q) return undefined;

  const byId = cycles.find((c) => c.id === q);
  if (byId) return byId;

  const lower = q.toLowerCase();
  const bySlug = cycles.find((c) => c.slug.toLowerCase() === lower);
  if (bySlug) return bySlug;

  const byName = cycles.find((c) => c.name.trim().toLowerCase() === lower);
  if (byName) return byName;

  // "cycle 10" / "cycle-10" / "10" → match the number in "Cycle 10".
  const numberMatch = /^(?:cycle[\s_-]*)?(\d+)$/i.exec(lower);
  if (numberMatch) {
    const n = numberMatch[1];
    return cycles.find((c) => {
      const cycleNumber = /(\d+)\s*$/.exec(c.name.trim());
      return cycleNumber?.[1] === n;
    });
  }

  return undefined;
}
