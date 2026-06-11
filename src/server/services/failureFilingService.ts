import { type PrismaClient } from "@prisma/client";

import { getCalibrationGate } from "./calibrationGateService";
import { type CalibrationGateResult } from "./calibrationGate";
import {
  buildFiling,
  clusterFailures,
  type FailureToFile,
  type Filing,
  type FilingDestination,
} from "./failureFiling";

/**
 * Level B auto-filing service (ADR-0012 decision 4). Orchestrates:
 * calibration gate → unfiled failures → cluster → file → mark filed.
 *
 * GATED: runs only when the calibration gate reports isCalibrated
 * (decision 9). `overrideGate` exists for testing only and is logged
 * loudly. Idempotent: ThreadScore.filedAt marks a Thread as filed, so
 * re-runs file nothing new when no new failures exist.
 *
 * Destination filers are injected so the service is unit-testable and the
 * script owns the messy parts (bd CLI subprocesses, Ticket creation).
 */

export type DestinationFilers = Record<
  FilingDestination,
  (filing: Filing) => Promise<string /* destination ref, e.g. "beads:x12" */>
>;

export interface FileFailuresOptions {
  filers: DestinationFilers;
  /** Testing escape hatch — files even when the calibration gate is closed. */
  overrideGate?: boolean;
  /** Report what would be filed without filing or marking anything. */
  dryRun?: boolean;
  log?: (message: string) => void;
  now?: () => Date;
}

export interface FiledResult {
  filing: Filing;
  /** Destination ref; "(dry-run)" when nothing was actually filed. */
  ref: string;
}

export interface FileFailuresResult {
  gate: CalibrationGateResult;
  gateOverridden: boolean;
  /** Unfiled failures found before clustering. */
  unfiledCount: number;
  filed: FiledResult[];
}

export async function fileFailures(
  db: PrismaClient,
  options: FileFailuresOptions,
): Promise<FileFailuresResult> {
  const log = options.log ?? console.log;
  const now = options.now ?? (() => new Date());

  const gate = await getCalibrationGate(db);
  if (!gate.calibrated && !options.overrideGate) {
    log(
      `Calibration gate CLOSED — no filings (${gate.reason}) ` +
        `Level B stays locked until the judge is calibrated (ADR-0012 decision 9).`,
    );
    return { gate, gateOverridden: false, unfiledCount: 0, filed: [] };
  }
  if (!gate.calibrated && options.overrideGate) {
    log(`⚠️  Calibration gate CLOSED but --override-gate supplied (testing only). ${gate.reason}`);
  }

  // Idempotency: only failures never filed before (decision 4).
  const unfiled = await db.threadScore.findMany({
    where: { failureLane: { not: null }, filedAt: null },
    select: {
      conversationId: true,
      failureLane: true,
      overallScore: true,
      reasoning: true,
      agentId: true,
      evalCase: { select: { expectation: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const failures: FailureToFile[] = unfiled.map((score) => ({
    conversationId: score.conversationId,
    lane: score.failureLane!,
    overallScore: score.overallScore,
    reasoning: score.reasoning,
    expectation: score.evalCase?.expectation ?? null,
    agentId: score.agentId,
  }));

  if (failures.length === 0) {
    log("No unfiled failures — nothing to do.");
    return { gate, gateOverridden: options.overrideGate ?? false, unfiledCount: 0, filed: [] };
  }

  const filings = clusterFailures(failures).map(buildFiling);
  log(
    `${failures.length} unfiled failure(s) → ${filings.length} filing(s) after clustering.`,
  );

  const filed: FiledResult[] = [];
  for (const filing of filings) {
    if (options.dryRun) {
      log(`[dry-run] ${filing.destination}: ${filing.title} (${filing.conversationIds.length} Thread(s))`);
      filed.push({ filing, ref: "(dry-run)" });
      continue;
    }
    const ref = await options.filers[filing.destination](filing);
    await db.threadScore.updateMany({
      where: { conversationId: { in: filing.conversationIds } },
      data: { filedAt: now(), filedRef: ref },
    });
    log(`Filed → ${filing.destination} as ${ref}: ${filing.title}`);
    filed.push({ filing, ref });
  }

  return {
    gate,
    gateOverridden: options.overrideGate ?? false,
    unfiledCount: failures.length,
    filed,
  };
}
