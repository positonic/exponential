import { describe, expect, it } from "vitest";

import {
  CALIBRATION_AGREEMENT_THRESHOLD,
  CALIBRATION_MIN_DIRECTIONAL_PAIRS,
  computeCalibration,
  humanDirection,
  isCalibrated,
  type CalibrationPair,
} from "~/server/services/calibrationGate";

const pair = (overrides: Partial<CalibrationPair>): CalibrationPair => ({
  conversationId: "c1",
  judgePassed: true,
  failureLane: null,
  judgeVersion: "v1",
  humanRating: 5,
  ...overrides,
});

/** n agreeing directional pairs: judge pass + human 5. */
const agreeing = (n: number, judgeVersion = "v1"): CalibrationPair[] =>
  Array.from({ length: n }, (_, i) =>
    pair({ conversationId: `agree-${i}`, judgeVersion }),
  );

describe("humanDirection", () => {
  it("maps 4-5 positive, 1-2 negative, 3 neutral", () => {
    expect(humanDirection(5)).toBe("positive");
    expect(humanDirection(4)).toBe("positive");
    expect(humanDirection(3)).toBe("neutral");
    expect(humanDirection(2)).toBe("negative");
    expect(humanDirection(1)).toBe("negative");
  });
});

describe("computeCalibration", () => {
  it("counts agreements and disagreements directionally", () => {
    const stats = computeCalibration([
      pair({ conversationId: "a", judgePassed: true, humanRating: 5 }), // agree
      pair({
        conversationId: "b",
        judgePassed: false,
        failureLane: "agent_behaviour",
        humanRating: 1,
      }), // agree
      pair({ conversationId: "c", judgePassed: true, humanRating: 1 }), // disagree
      pair({ conversationId: "d", judgePassed: false, failureLane: "code_bug", humanRating: 3 }), // neutral
    ]);
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      judgeVersion: "v1",
      pairCount: 4,
      directionalPairs: 3,
      agreements: 2,
    });
    expect(stats[0]!.agreementRate).toBeCloseTo(2 / 3);
  });

  it("partitions per judge version — a judge change resets the evidence", () => {
    const stats = computeCalibration([
      ...agreeing(2, "v1"),
      pair({ conversationId: "x", judgeVersion: "v2", judgePassed: true, humanRating: 1 }),
    ]);
    expect(stats.map((s) => s.judgeVersion)).toEqual(["v1", "v2"]);
    expect(stats.find((s) => s.judgeVersion === "v1")?.agreementRate).toBe(1);
    expect(stats.find((s) => s.judgeVersion === "v2")?.agreementRate).toBe(0);
  });

  it("splits agreement per failure lane", () => {
    const stats = computeCalibration([
      pair({ conversationId: "a", judgePassed: false, failureLane: "code_bug", humanRating: 1 }),
      pair({ conversationId: "b", judgePassed: false, failureLane: "code_bug", humanRating: 5 }),
      pair({ conversationId: "c", judgePassed: true, humanRating: 5 }),
    ]);
    expect(stats[0]!.perLane).toEqual([
      { lane: "code_bug", directionalPairs: 2, agreements: 1 },
      { lane: "passing", directionalPairs: 1, agreements: 1 },
    ]);
  });

  it("reports the overlap rating distribution (selection-bias visibility)", () => {
    const stats = computeCalibration([
      pair({ conversationId: "a", humanRating: 5 }),
      pair({ conversationId: "b", humanRating: 4.6 }), // rounds to 5
      pair({ conversationId: "c", humanRating: 1 }),
    ]);
    expect(stats[0]!.ratingDistribution).toEqual([
      { rating: 1, count: 1 },
      { rating: 2, count: 0 },
      { rating: 3, count: 0 },
      { rating: 4, count: 0 },
      { rating: 5, count: 2 },
    ]);
  });
});

describe("isCalibrated", () => {
  it("zero overlap pairs ⇒ gate closed, never vacuously open", () => {
    const gate = isCalibrated([], "v1");
    expect(gate.calibrated).toBe(false);
    expect(gate.reason).toContain("No judge/human overlap pairs");
  });

  it("pairs for another judge version do not open this version's gate", () => {
    const gate = isCalibrated(agreeing(20, "v0"), "v1");
    expect(gate.calibrated).toBe(false);
  });

  it("stays closed below the minimum directional-pair volume even at 100% agreement", () => {
    const gate = isCalibrated(agreeing(CALIBRATION_MIN_DIRECTIONAL_PAIRS - 1), "v1");
    expect(gate.calibrated).toBe(false);
    expect(gate.reason).toContain("volume");
  });

  it("opens exactly at the threshold (>= semantics)", () => {
    // 8/10 = exactly 80%
    const pairs = [
      ...agreeing(8),
      pair({ conversationId: "d1", judgePassed: true, humanRating: 1 }),
      pair({ conversationId: "d2", judgePassed: true, humanRating: 1 }),
    ];
    expect(CALIBRATION_AGREEMENT_THRESHOLD).toBe(0.8);
    const gate = isCalibrated(pairs, "v1");
    expect(gate.stats?.agreementRate).toBeCloseTo(0.8);
    expect(gate.calibrated).toBe(true);
  });

  it("closes just below the threshold", () => {
    // 8/11 ≈ 72.7%
    const pairs = [
      ...agreeing(8),
      pair({ conversationId: "d1", judgePassed: true, humanRating: 1 }),
      pair({ conversationId: "d2", judgePassed: true, humanRating: 1 }),
      pair({ conversationId: "d3", judgePassed: true, humanRating: 1 }),
    ];
    const gate = isCalibrated(pairs, "v1");
    expect(gate.calibrated).toBe(false);
    expect(gate.reason).toContain("below");
  });

  it("neutral ratings cannot open the gate (excluded from the denominator)", () => {
    const pairs = Array.from({ length: 20 }, (_, i) =>
      pair({ conversationId: `n-${i}`, humanRating: 3 }),
    );
    const gate = isCalibrated(pairs, "v1");
    expect(gate.calibrated).toBe(false);
    expect(gate.stats?.directionalPairs).toBe(0);
  });

  it("honours threshold and min-pairs overrides", () => {
    const pairs = [...agreeing(3), pair({ conversationId: "d", judgePassed: true, humanRating: 1 })];
    expect(
      isCalibrated(pairs, "v1", { threshold: 0.7, minDirectionalPairs: 4 }).calibrated,
    ).toBe(true);
    expect(
      isCalibrated(pairs, "v1", { threshold: 0.9, minDirectionalPairs: 4 }).calibrated,
    ).toBe(false);
  });
});
