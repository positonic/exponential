/**
 * calibrationGate — judge-vs-human directional agreement (ADR-0012 decision 9).
 *
 * Wherever a Thread has BOTH a ThreadScore (the judge's apparent-quality
 * verdict) and a human Feedback rating (ground truth), the two are compared
 * directionally. Level B/C autonomy (auto-filing, auto prompt-patch PRs)
 * stays locked until the judge clears an agreement threshold on that
 * overlap set — an uncalibrated judge driving automated prompt changes
 * optimises for the wrong thing, confidently.
 *
 * Pure functions only: overlap pairs in → stats out. No DB, no network —
 * calibrationGateService.ts assembles pairs from Prisma and is what Level
 * B/C code consults.
 *
 * Direction mapping: the judge's verdict is binary (failureLane null =
 * pass). A human rating ≥ 4 is positive, ≤ 2 negative; 3 is neutral and
 * excluded from directional agreement (but still counted and reported).
 * Human ratings are sparse and selection-biased — people rate when angry
 * or delighted — so the overlap set's rating distribution is reported
 * alongside agreement rather than silently trusted.
 *
 * Agreement is partitioned per judgeVersion: a judge-prompt change resets
 * the evidence rather than inheriting the old version's track record.
 */

export interface CalibrationPair {
  conversationId: string;
  /** ThreadScore verdict: failureLane === null. */
  judgePassed: boolean;
  failureLane: string | null;
  judgeVersion: string;
  /** Mean human Feedback rating (1–5) across the Thread's rated turns. */
  humanRating: number;
}

export type HumanDirection = "positive" | "negative" | "neutral";

export function humanDirection(rating: number): HumanDirection {
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "neutral";
}

export interface LaneAgreement {
  /** Failure lane of the judge verdict, or "passing". */
  lane: string;
  directionalPairs: number;
  agreements: number;
}

export interface CalibrationStats {
  judgeVersion: string;
  /** All overlap pairs for this judge version, neutrals included. */
  pairCount: number;
  /** Pairs with a non-neutral human direction — the agreement denominator. */
  directionalPairs: number;
  agreements: number;
  /** agreements / directionalPairs; null when there are no directional pairs. */
  agreementRate: number | null;
  perLane: LaneAgreement[];
  /** Rating histogram of the overlap set (selection-bias visibility). */
  ratingDistribution: Array<{ rating: 1 | 2 | 3 | 4 | 5; count: number }>;
}

function pairAgrees(pair: CalibrationPair): boolean | null {
  const direction = humanDirection(pair.humanRating);
  if (direction === "neutral") return null;
  return (direction === "positive") === pair.judgePassed;
}

/** Compute agreement stats, partitioned per judge version. */
export function computeCalibration(pairs: CalibrationPair[]): CalibrationStats[] {
  const byVersion = new Map<string, CalibrationPair[]>();
  for (const pair of pairs) {
    const bucket = byVersion.get(pair.judgeVersion) ?? [];
    bucket.push(pair);
    byVersion.set(pair.judgeVersion, bucket);
  }

  return [...byVersion.entries()]
    .map(([judgeVersion, versionPairs]) => {
      let directionalPairs = 0;
      let agreements = 0;
      const byLane = new Map<string, { directional: number; agreements: number }>();
      const histogram = new Map<number, number>();

      for (const pair of versionPairs) {
        const rounded = Math.min(5, Math.max(1, Math.round(pair.humanRating)));
        histogram.set(rounded, (histogram.get(rounded) ?? 0) + 1);

        const agrees = pairAgrees(pair);
        if (agrees === null) continue;
        directionalPairs += 1;
        if (agrees) agreements += 1;

        const lane = pair.failureLane ?? "passing";
        const laneBucket = byLane.get(lane) ?? { directional: 0, agreements: 0 };
        laneBucket.directional += 1;
        if (agrees) laneBucket.agreements += 1;
        byLane.set(lane, laneBucket);
      }

      return {
        judgeVersion,
        pairCount: versionPairs.length,
        directionalPairs,
        agreements,
        agreementRate: directionalPairs > 0 ? agreements / directionalPairs : null,
        perLane: [...byLane.entries()]
          .map(([lane, b]) => ({
            lane,
            directionalPairs: b.directional,
            agreements: b.agreements,
          }))
          .sort((a, b) => b.directionalPairs - a.directionalPairs),
        ratingDistribution: ([1, 2, 3, 4, 5] as const).map((rating) => ({
          rating,
          count: histogram.get(rating) ?? 0,
        })),
      };
    })
    .sort((a, b) => a.judgeVersion.localeCompare(b.judgeVersion));
}

/** Default gate: ≥80% directional agreement (ADR-0012 decision 9). */
export const CALIBRATION_AGREEMENT_THRESHOLD = 0.8;

/**
 * Minimum directional pairs before the gate can open. One lucky pair must
 * not unlock autonomy; the PRD is explicit that the overlap set needs
 * volume — until it has it, the loop runs at Level A regardless of tooling.
 */
export const CALIBRATION_MIN_DIRECTIONAL_PAIRS = 10;

export interface CalibrationGateOptions {
  threshold?: number;
  minDirectionalPairs?: number;
}

export interface CalibrationGateResult {
  calibrated: boolean;
  reason: string;
  judgeVersion: string;
  stats: CalibrationStats | null;
  threshold: number;
  minDirectionalPairs: number;
}

/**
 * The explicit check Level B/C features must consult before doing anything
 * autonomous. Zero overlap pairs ⇒ closed — never vacuously open.
 */
export function isCalibrated(
  pairs: CalibrationPair[],
  judgeVersion: string,
  options: CalibrationGateOptions = {},
): CalibrationGateResult {
  const threshold = options.threshold ?? CALIBRATION_AGREEMENT_THRESHOLD;
  const minDirectionalPairs =
    options.minDirectionalPairs ?? CALIBRATION_MIN_DIRECTIONAL_PAIRS;

  const stats =
    computeCalibration(pairs).find((s) => s.judgeVersion === judgeVersion) ?? null;
  const base = { judgeVersion, stats, threshold, minDirectionalPairs };

  if (!stats || stats.pairCount === 0) {
    return {
      ...base,
      calibrated: false,
      reason: `No judge/human overlap pairs for judge ${judgeVersion} — gate closed.`,
    };
  }
  if (stats.directionalPairs < minDirectionalPairs) {
    return {
      ...base,
      calibrated: false,
      reason:
        `Only ${stats.directionalPairs} directional pair(s) for judge ${judgeVersion} ` +
        `(minimum ${minDirectionalPairs}) — gate closed until the overlap set has volume.`,
    };
  }
  const rate = stats.agreementRate ?? 0;
  if (rate < threshold) {
    return {
      ...base,
      calibrated: false,
      reason:
        `Directional agreement ${(rate * 100).toFixed(1)}% is below the ` +
        `${(threshold * 100).toFixed(0)}% threshold (${stats.agreements}/${stats.directionalPairs}) — gate closed.`,
    };
  }
  return {
    ...base,
    calibrated: true,
    reason:
      `Directional agreement ${(rate * 100).toFixed(1)}% ` +
      `(${stats.agreements}/${stats.directionalPairs}) clears the ` +
      `${(threshold * 100).toFixed(0)}% threshold — gate open.`,
  };
}
