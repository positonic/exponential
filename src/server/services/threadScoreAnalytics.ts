/**
 * threadScoreAnalytics — pure aggregation over ThreadScore rows for the
 * admin trends view and the weekly digest (ADR-0012 Phase 2).
 *
 * Three quality numbers stay distinct everywhere these aggregates surface:
 * Thread score (judge, apparent), Feedback.rating (human, ground truth),
 * AiInteractionHistory.confidenceScore (Zoe's self-report). Nothing in this
 * module blends them.
 *
 * Pure functions over constructed inputs — no Prisma, no I/O — so the maths
 * is unit-testable; the admin router does the fetching.
 */

export interface ScoredThreadRow {
  conversationId: string;
  agentId: string | null;
  overallScore: number;
  failureLane: string | null;
  createdAt: Date;
}

export interface TrendPoint {
  /** YYYY-MM-DD (UTC) bucket. */
  date: string;
  count: number;
  /** Mean judge overallScore for the bucket; null when count is 0. */
  avgScore: number | null;
}

export interface AgentTrendSeries {
  agentId: string;
  points: TrendPoint[];
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Enumerate every UTC day key in [from, to] so the trend has no gaps. */
function dayKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  while (cursor.getTime() <= end) {
    keys.push(utcDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function trendFor(scores: ScoredThreadRow[], dayKeys: string[]): TrendPoint[] {
  const byDay = new Map<string, { sum: number; count: number }>();
  for (const score of scores) {
    const key = utcDayKey(score.createdAt);
    const bucket = byDay.get(key) ?? { sum: 0, count: 0 };
    bucket.sum += score.overallScore;
    bucket.count += 1;
    byDay.set(key, bucket);
  }
  return dayKeys.map((date) => {
    const bucket = byDay.get(date);
    return {
      date,
      count: bucket?.count ?? 0,
      avgScore: bucket ? Math.round(bucket.sum / bucket.count) : null,
    };
  });
}

/**
 * Daily judge-score trend over [from, to]: one overall series plus one per
 * agentId (unknown agents grouped under "unknown").
 */
export function buildScoreTrend(
  scores: ScoredThreadRow[],
  from: Date,
  to: Date,
): { overall: TrendPoint[]; byAgent: AgentTrendSeries[] } {
  const dayKeys = dayKeysBetween(from, to);
  const byAgent = new Map<string, ScoredThreadRow[]>();
  for (const score of scores) {
    const agentId = score.agentId ?? "unknown";
    const bucket = byAgent.get(agentId) ?? [];
    bucket.push(score);
    byAgent.set(agentId, bucket);
  }
  return {
    overall: trendFor(scores, dayKeys),
    byAgent: [...byAgent.entries()]
      .map(([agentId, agentScores]) => ({ agentId, points: trendFor(agentScores, dayKeys) }))
      .sort((a, b) => a.agentId.localeCompare(b.agentId)),
  };
}

export interface LaneBreakdownEntry {
  /** A Failure lane, or "passing" for Threads the judge passed (failureLane null). */
  lane: string;
  count: number;
  avgScore: number | null;
}

/** Counts + mean judge score per Failure lane, failures ranked worst-count first,
 * with passing Threads as a final explicit bucket (never hidden). */
export function buildLaneBreakdown(scores: ScoredThreadRow[]): LaneBreakdownEntry[] {
  const byLane = new Map<string, { sum: number; count: number }>();
  for (const score of scores) {
    const lane = score.failureLane ?? "passing";
    const bucket = byLane.get(lane) ?? { sum: 0, count: 0 };
    bucket.sum += score.overallScore;
    bucket.count += 1;
    byLane.set(lane, bucket);
  }
  const entries = [...byLane.entries()].map(([lane, b]) => ({
    lane,
    count: b.count,
    avgScore: b.count > 0 ? Math.round(b.sum / b.count) : null,
  }));
  const failures = entries.filter((e) => e.lane !== "passing").sort((a, b) => b.count - a.count);
  const passing = entries.filter((e) => e.lane === "passing");
  return [...failures, ...passing];
}

export interface PromptVersionBreakdownEntry {
  /** Composite stamp (router@X+brain@Y), router-only fallback, or "unstamped"
   * for Threads predating ADR-0012 decision 7. */
  promptVersion: string;
  count: number;
  avgScore: number | null;
  failureCount: number;
}

/**
 * Score-by-Prompt-version — the proof a prompt change helped, and the
 * canary/rollback comparison across a deploy boundary (ADR-0012 decision 7).
 *
 * A Thread is attributed to the promptVersion of its LAST stamped turn: the
 * judge scores the Thread as a whole, and the last response is the one that
 * settled it. `versionByConversation` maps conversationId → that stamp
 * (computed by the caller from AiInteractionHistory).
 */
export function buildPromptVersionBreakdown(
  scores: ScoredThreadRow[],
  versionByConversation: Map<string, string>,
): PromptVersionBreakdownEntry[] {
  const byVersion = new Map<string, { sum: number; count: number; failures: number }>();
  for (const score of scores) {
    const version = versionByConversation.get(score.conversationId) ?? "unstamped";
    const bucket = byVersion.get(version) ?? { sum: 0, count: 0, failures: 0 };
    bucket.sum += score.overallScore;
    bucket.count += 1;
    if (score.failureLane !== null) bucket.failures += 1;
    byVersion.set(version, bucket);
  }
  return [...byVersion.entries()]
    .map(([promptVersion, b]) => ({
      promptVersion,
      count: b.count,
      avgScore: b.count > 0 ? Math.round(b.sum / b.count) : null,
      failureCount: b.failures,
    }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Reduce each Thread's turns to the Prompt version of its last stamped turn.
 * Turns must carry createdAt so "last" is well-defined; unstamped turns are
 * ignored (an older deploy mid-Thread doesn't erase a later stamp).
 */
export function lastPromptVersionByConversation(
  turns: Array<{ conversationId: string; promptVersion: string | null; createdAt: Date }>,
): Map<string, string> {
  const latest = new Map<string, { at: number; version: string }>();
  for (const turn of turns) {
    if (!turn.promptVersion) continue;
    const at = turn.createdAt.getTime();
    const current = latest.get(turn.conversationId);
    if (!current || at > current.at) {
      latest.set(turn.conversationId, { at, version: turn.promptVersion });
    }
  }
  return new Map([...latest.entries()].map(([id, v]) => [id, v.version]));
}
