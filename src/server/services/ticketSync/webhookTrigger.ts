import type { PrismaClient } from "@prisma/client";
import { runInboundTicketSync, type TicketSyncRemoteAdapter } from "./engine";
import { createNotionTicketSyncAdapter } from "./notionAdapter";

/**
 * ticketSync/webhookTrigger — turn a verified Notion webhook event into an
 * inbound pull.
 *
 * The webhook is a doorbell, not a sync engine: it resolves which enabled
 * sync config(s) the event's database ids belong to and fires the SAME
 * inbound run the cron sweep runs, with trigger `webhook`. It deliberately
 * reuses the scheduler's overlap/debounce guard instead of inventing a queue —
 * a burst of Notion edits collapses into at most one run per config per
 * {@link WEBHOOK_DEBOUNCE_MS} window, and never overlaps an in-flight run.
 *
 * The engine run is fire-and-forget: this returns as soon as every matched
 * config has either been skipped (guarded) or had its run kicked off, so the
 * route can answer 200 fast. Errors are logged; the engine records its own
 * errored run record.
 */

/**
 * Collapse a burst: a config whose newest run is still `running`, or started
 * within this window, is skipped rather than piling a redundant run on top.
 * Matches the intent of the scheduler's overlap guard at webhook cadence.
 */
export const WEBHOOK_DEBOUNCE_MS = 15_000;

export interface WebhookTriggerItem {
  configId: string;
  productId: string;
  outcome: "triggered" | "skipped-running" | "error";
  detail?: string;
}

export interface WebhookTriggerResult {
  matched: number;
  items: WebhookTriggerItem[];
}

type AdapterFactory = (
  db: PrismaClient,
  config: { integrationId: string; propertyNames: unknown },
) => Promise<
  { ok: true; adapter: TicketSyncRemoteAdapter } | { ok: false; error: string }
>;

type SyncRunner = typeof runInboundTicketSync;

/** Notion ids arrive both dashed (UUID) and bare (32 hex) — compare canonically. */
export function normalizeNotionId(id: string): string {
  return id.replace(/-/g, "").toLowerCase();
}

/**
 * Pull every id from an event JSON that could name the affected database.
 * Notion's payloads are thin and their shape varies by event type, so we
 * gather all plausible carriers (`data.parent.database_id`, a database-typed
 * `data.parent.id`, `entity.id`, top-level `database_id`) and let the config
 * lookup decide which one is real. Nothing beyond ids is ever read.
 */
export function extractDatabaseCandidateIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const b = body as Record<string, unknown>;
  const data = (b.data ?? null) as Record<string, unknown> | null;
  const parent = (data?.parent ?? null) as Record<string, unknown> | null;
  const entity = (b.entity ?? null) as Record<string, unknown> | null;

  const candidates: unknown[] = [
    parent?.database_id,
    // A page/database event whose parent IS a database carries the id under
    // `parent.id` with `parent.type === "database"`.
    parent && parent.type === "database" ? parent.id : null,
    entity?.id,
    b.database_id,
    data?.database_id,
  ];

  const seen = new Set<string>();
  const ids: string[] = [];
  for (const c of candidates) {
    if (typeof c !== "string" || c.length === 0) continue;
    const norm = normalizeNotionId(c);
    if (seen.has(norm)) continue;
    seen.add(norm);
    ids.push(norm);
  }
  return ids;
}

/**
 * Resolve the enabled configs a webhook event touches and kick off an inbound
 * run for each, guarded by the debounce/overlap window. Fire-and-forget: the
 * returned promise settles once runs are dispatched, not once they finish.
 */
export async function triggerWebhookInboundSync(
  db: PrismaClient,
  now: Date,
  candidateDatabaseIds: string[],
  deps?: { adapterFactory?: AdapterFactory; runSync?: SyncRunner },
): Promise<WebhookTriggerResult> {
  const adapterFactory = deps?.adapterFactory ?? createNotionTicketSyncAdapter;
  const runSync = deps?.runSync ?? runInboundTicketSync;

  const wanted = new Set(candidateDatabaseIds);
  if (wanted.size === 0) return { matched: 0, items: [] };

  // Disconnected configs (null integration link, ADR-0042) can't sync — same
  // filter the cron sweep uses. Match by normalized databaseId locally so a
  // dashed/bare mismatch never causes a miss.
  const configs = (
    await db.ticketSyncConfig.findMany({
      where: { enabled: true, integrationId: { not: null } },
      select: {
        id: true,
        productId: true,
        integrationId: true,
        propertyNames: true,
        databaseId: true,
      },
    })
  ).filter(
    (config): config is typeof config & { integrationId: string } =>
      config.integrationId !== null &&
      wanted.has(normalizeNotionId(config.databaseId)),
  );

  const items: WebhookTriggerItem[] = [];
  const debounceBefore = new Date(now.getTime() - WEBHOOK_DEBOUNCE_MS);

  for (const config of configs) {
    try {
      // Overlap + debounce: the newest run being in flight, or having started
      // within the debounce window, means this doorbell is redundant.
      const recent = await db.ticketSyncRun.findFirst({
        where: { configId: config.id },
        orderBy: { startedAt: "desc" },
        select: { id: true, status: true, startedAt: true },
      });
      if (
        recent &&
        (recent.status === "running" || recent.startedAt > debounceBefore)
      ) {
        items.push({
          configId: config.id,
          productId: config.productId,
          outcome: "skipped-running",
          detail:
            recent.status === "running"
              ? `run ${recent.id} still in flight`
              : `run ${recent.id} started <${WEBHOOK_DEBOUNCE_MS / 1000}s ago`,
        });
        continue;
      }

      const adapterResult = await adapterFactory(db, config);
      if (!adapterResult.ok) {
        console.error(
          `[NotionWebhook] adapter unavailable for config ${config.id}: ${adapterResult.error}`,
        );
        items.push({
          configId: config.id,
          productId: config.productId,
          outcome: "error",
          detail: adapterResult.error,
        });
        continue;
      }

      // Fire-and-forget: the engine owns its own run record + error handling,
      // so a failed run never blocks the 200. Never await the run here.
      void runSync(db, adapterResult.adapter, {
        configId: config.id,
        trigger: "webhook",
      }).catch((error: unknown) => {
        console.error(
          `[NotionWebhook] inbound run failed for config ${config.id}:`,
          error,
        );
      });

      items.push({
        configId: config.id,
        productId: config.productId,
        outcome: "triggered",
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown error";
      console.error(
        `[NotionWebhook] failed to dispatch config ${config.id}: ${detail}`,
      );
      items.push({
        configId: config.id,
        productId: config.productId,
        outcome: "error",
        detail,
      });
    }
  }

  return { matched: configs.length, items };
}
