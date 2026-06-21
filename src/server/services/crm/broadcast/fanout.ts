/**
 * Pure per-recipient fan-out for Broadcast sends (CONTEXT.md → Broadcast).
 *
 * The engine is all-or-nothing per step ([ADR-0029](../../../../../docs/adr/0029-automation-platform-primitive.md)),
 * which is wrong for a fan-out: one bad address must not fail the whole send. So
 * resilience lives here — skip unmailable + already-sent recipients, send each in
 * isolation (collect-and-continue), and report a summary. The `send` closure does
 * its own SENT/FAILED side-effects and re-throws on failure so it is counted.
 *
 * Pure (no Prisma/email/Date) → unit-testable with a fake `send`.
 */
export interface FanoutRecipient {
  memberId: string;
  email: string | null;
}

export interface FanoutResult {
  attempted: number;
  sent: number;
  failed: number;
  skipped: number;
  failures: { memberId: string; error: string }[];
}

export async function fanoutSend<T extends FanoutRecipient>(opts: {
  recipients: T[];
  /** memberIds already sent this period — skipped for retry-idempotency. */
  alreadySent: ReadonlySet<string>;
  send: (recipient: T) => Promise<void>;
}): Promise<FanoutResult> {
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const failures: { memberId: string; error: string }[] = [];

  for (const r of opts.recipients) {
    if (!r.email) {
      skipped++;
      continue;
    }
    if (opts.alreadySent.has(r.memberId)) {
      skipped++;
      continue;
    }
    try {
      await opts.send(r);
      sent++;
    } catch (e) {
      failed++;
      failures.push({
        memberId: r.memberId,
        error: e instanceof Error ? e.message : "unknown send error",
      });
    }
  }

  return { attempted: sent + failed, sent, failed, skipped, failures };
}

/**
 * Whole-batch failure: everyone we attempted failed (an infra-class problem —
 * provider down/auth). The step throws on this so the run is marked FAILED;
 * isolated per-address failures do not.
 */
export function isWholeBatchFailure(result: FanoutResult): boolean {
  return result.attempted > 0 && result.sent === 0;
}
