/**
 * failureFiling — Level B lane-routed auto-filing, the pure half
 * (ADR-0012 decision 4 + Phase 3 Level B).
 *
 * Scored failures are filed into the tracker owned by their Failure lane
 * instead of a human reading the Level-A report:
 *
 *   code_bug        → beads issue in THIS repo (tRPC/tool fix)
 *   agent_behaviour → beads issue in ../mastra (brain instructions) or in
 *                     this repo (router persona / voice catalog), by where
 *                     the judge's reasoning points
 *   capability_gap  → a product Ticket (missing capability, not a bug)
 *
 * This module is pure: clustering, routing, and body formatting over
 * constructed inputs. failureFilingService.ts owns the gate check, DB
 * reads/writes, and the injected destination filers.
 */

export interface FailureToFile {
  conversationId: string;
  lane: string;
  overallScore: number;
  reasoning: string;
  /** Violated contract expectation from the distilled EvalCase, if any. */
  expectation: string | null;
  agentId: string | null;
}

export interface FailureCluster {
  lane: string;
  /** Worst (lowest-scoring) first. */
  failures: FailureToFile[];
}

const STOP_WORDS = new Set([
  "the", "a", "an", "to", "of", "and", "or", "in", "on", "for", "is", "are",
  "was", "be", "should", "must", "have", "has", "not", "no", "with", "that",
  "this", "it", "her", "his", "their", "zoe", "user",
]);

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Text a failure is clustered on: the expectation when present (it names
 * the violated contract clause), else the judge's reasoning. */
function clusterText(failure: FailureToFile): string {
  return failure.expectation ?? failure.reasoning;
}

export const CLUSTER_SIMILARITY_THRESHOLD = 0.5;

/**
 * Collapse near-identical failures (same lane, similar violated
 * expectation) into one cluster so a run files one issue with N example
 * Threads rather than N issues. Greedy and deterministic: failures join
 * the first cluster whose seed text is ≥ threshold Jaccard-similar.
 */
export function clusterFailures(
  failures: FailureToFile[],
  threshold: number = CLUSTER_SIMILARITY_THRESHOLD,
): FailureCluster[] {
  const clusters: Array<FailureCluster & { seedTokens: Set<string> }> = [];
  for (const failure of failures) {
    const tokens = tokenSet(clusterText(failure));
    const home = clusters.find(
      (cluster) =>
        cluster.lane === failure.lane &&
        jaccard(cluster.seedTokens, tokens) >= threshold,
    );
    if (home) {
      home.failures.push(failure);
    } else {
      clusters.push({ lane: failure.lane, failures: [failure], seedTokens: tokens });
    }
  }
  return clusters.map(({ lane, failures: clusterFailures }) => ({
    lane,
    failures: [...clusterFailures].sort((a, b) => a.overallScore - b.overallScore),
  }));
}

export type FilingDestination = "exponential-beads" | "mastra-beads" | "product-ticket";

/** Signals in the judge's reasoning/expectation that the agent_behaviour
 * fix lives in THIS repo (server-issued router persona / voice catalog,
 * ADR-0005) rather than in Zoe-the-brain's instructions in ../mastra. */
const ROUTER_SIDE_SIGNALS = /\b(router|persona|voice (tool )?catalog|voice.?router)\b/i;

export function routeCluster(cluster: FailureCluster): FilingDestination {
  switch (cluster.lane) {
    case "code_bug":
      return "exponential-beads";
    case "capability_gap":
      return "product-ticket";
    case "agent_behaviour": {
      const evidence = cluster.failures
        .map((f) => `${f.expectation ?? ""} ${f.reasoning}`)
        .join(" ");
      return ROUTER_SIDE_SIGNALS.test(evidence) ? "exponential-beads" : "mastra-beads";
    }
    default:
      // Unknown lane: keep it visible in this repo rather than dropping it.
      return "exponential-beads";
  }
}

export interface Filing {
  destination: FilingDestination;
  lane: string;
  title: string;
  body: string;
  /** Every Thread covered by this filing (for filed-state marking). */
  conversationIds: string[];
}

function oneLine(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export const MAX_EXAMPLES_PER_FILING = 3;

/** Render one cluster as a filing: judge reasoning + example Threads. */
export function buildFiling(cluster: FailureCluster): Filing {
  const worst = cluster.failures[0]!;
  const summary = oneLine(worst.expectation ?? worst.reasoning, 90);
  const count = cluster.failures.length;
  const title =
    count > 1
      ? `[agent-quality:${cluster.lane}] ${summary} (${count} Threads)`
      : `[agent-quality:${cluster.lane}] ${summary}`;

  const examples = cluster.failures
    .slice(0, MAX_EXAMPLES_PER_FILING)
    .map((failure) => {
      const lines = [
        `- Thread \`${failure.conversationId}\` — judge score ${failure.overallScore}/100` +
          (failure.agentId ? ` (${failure.agentId})` : ""),
        `  - Judge reasoning: ${oneLine(failure.reasoning, 300)}`,
      ];
      if (failure.expectation) {
        lines.push(`  - Violated expectation: ${oneLine(failure.expectation, 200)}`);
      }
      return lines.join("\n");
    })
    .join("\n");

  const omitted = count - Math.min(count, MAX_EXAMPLES_PER_FILING);
  const body = [
    `Auto-filed by Level B lane routing (ADR-0012 decision 4). ` +
      `${count} failing Thread(s) in lane \`${cluster.lane}\`, judged by the contract judge.`,
    ``,
    `## Example Threads`,
    ``,
    examples,
    ...(omitted > 0 ? [``, `(+${omitted} more Thread(s) in this cluster — see ThreadScore.filedRef)`] : []),
    ``,
    `Each Thread's full transcript and judgement: ThreadScore/EvalCase rows by conversationId.`,
  ].join("\n");

  return {
    destination: routeCluster(cluster),
    lane: cluster.lane,
    title,
    body,
    conversationIds: cluster.failures.map((f) => f.conversationId),
  };
}
