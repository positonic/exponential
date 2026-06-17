import { type PrismaClient } from "@prisma/client";

import { JUDGE_VERSION } from "./AgentEvalService";
import {
  isCalibrated,
  type CalibrationGateOptions,
  type CalibrationGateResult,
  type CalibrationPair,
} from "./calibrationGate";

/**
 * Assemble judge/human overlap pairs from the DB and run the pure gate
 * (ADR-0012 decision 9). This is THE check Level B/C code must call before
 * auto-filing issues or proposing prompt patches:
 *
 *   const gate = await getCalibrationGate(db);
 *   if (!gate.calibrated) { stay at Level A; surface gate.reason }
 *
 * A pair = one Thread with a ThreadScore (judge verdict) AND at least one
 * human Feedback rating on its turns; multiple ratings average.
 */
export async function buildCalibrationPairs(
  db: PrismaClient,
): Promise<CalibrationPair[]> {
  const scores = await db.threadScore.findMany({
    select: {
      conversationId: true,
      failureLane: true,
      judgeVersion: true,
    },
  });
  if (scores.length === 0) return [];

  const ratedTurns = await db.aiInteractionHistory.findMany({
    where: {
      conversationId: { in: scores.map((s) => s.conversationId) },
      feedback: { some: {} },
    },
    select: {
      conversationId: true,
      feedback: { select: { rating: true } },
    },
  });

  const ratingsByConversation = new Map<string, number[]>();
  for (const turn of ratedTurns) {
    if (turn.conversationId === null) continue;
    const bucket = ratingsByConversation.get(turn.conversationId) ?? [];
    bucket.push(...turn.feedback.map((f) => f.rating));
    ratingsByConversation.set(turn.conversationId, bucket);
  }

  return scores.flatMap((score) => {
    const ratings = ratingsByConversation.get(score.conversationId);
    if (!ratings || ratings.length === 0) return [];
    return [
      {
        conversationId: score.conversationId,
        judgePassed: score.failureLane === null,
        failureLane: score.failureLane,
        judgeVersion: score.judgeVersion,
        humanRating: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      },
    ];
  });
}

/** Current-judge-version gate state. Options override threshold/min-pairs. */
export async function getCalibrationGate(
  db: PrismaClient,
  options: CalibrationGateOptions = {},
): Promise<CalibrationGateResult> {
  const pairs = await buildCalibrationPairs(db);
  return isCalibrated(pairs, JUDGE_VERSION, options);
}
